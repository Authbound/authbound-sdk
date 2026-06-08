import type {
  StationRuntimeMode,
  StationVerification,
  StationVerificationDisclosure,
} from "@authbound/core";
import { computed, defineComponent, h, type PropType, ref, watch } from "vue";
import { useStationEntry } from "../composables/useStationEntry";
import { useStationOperatorFeed } from "../composables/useStationOperatorFeed";
import { QRCode } from "./QRCode";

export const StationEntry = defineComponent({
  name: "StationEntry",
  props: {
    gatewayBaseUrl: String,
    runtimeBaseUrl: String,
    runtimeMode: String as PropType<StationRuntimeMode>,
    stationId: { type: String, required: true },
    entryToken: { type: String, required: true },
  },
  setup(props) {
    const entry = useStationEntry(props);
    return () =>
      h("div", { "data-authbound-station-entry": "" }, [
        entry.spawn.value?.client_action
          ? h(
              "a",
              { href: entry.spawn.value.client_action.data },
              "Open wallet"
            )
          : h(
              "button",
              { disabled: entry.isLoading.value, onClick: () => entry.start() },
              entry.isLoading.value ? "Preparing" : "Start verification"
            ),
        entry.error.value
          ? h("p", { role: "alert" }, entry.error.value.message)
          : null,
      ]);
  },
});

export const StationEntryDisplay = defineComponent({
  name: "StationEntryDisplay",
  props: {
    gatewayBaseUrl: String,
    runtimeBaseUrl: String,
    runtimeMode: String as PropType<StationRuntimeMode>,
    stationId: { type: String, required: true },
    displayToken: { type: String, required: true },
  },
  setup(props) {
    const feed = useStationOperatorFeed(props);
    return () =>
      h("div", { "data-authbound-station-entry-display": "" }, [
        feed.display.value?.station.entry.qr_payload
          ? h(QRCode, { value: feed.display.value.station.entry.qr_payload })
          : h("span", feed.isLoading.value ? "Loading" : "Unavailable"),
        feed.error.value
          ? h("p", { role: "alert" }, feed.error.value.message)
          : null,
      ]);
  },
});

function preferredVerification(
  verifications: StationVerification[],
  selectedId: string | null
): StationVerification | null {
  return (
    verifications.find((item) => item.verification_id === selectedId) ??
    verifications.find((item) => item.status === "verified") ??
    verifications[0] ??
    null
  );
}

function booleanLabel(value: unknown): string {
  return typeof value === "boolean" ? (value ? "Yes" : "No") : "--";
}

function disclosureCacheKey(params: {
  displayToken: string;
  grantToken?: string;
  stationId: string;
  verificationId?: string;
}): string | null {
  if (!(params.grantToken && params.verificationId)) {
    return null;
  }
  return [
    params.stationId,
    params.displayToken,
    params.grantToken,
    params.verificationId,
  ].join("\u0000");
}

function disclosureIsActive(
  disclosure: StationVerificationDisclosure | undefined
): disclosure is StationVerificationDisclosure {
  if (!disclosure) {
    return false;
  }
  const expiresAt = Date.parse(disclosure.expires_at);
  return Number.isNaN(expiresAt) || expiresAt > Date.now();
}

export const StationOperatorConsole = defineComponent({
  name: "StationOperatorConsole",
  props: {
    gatewayBaseUrl: String,
    runtimeBaseUrl: String,
    runtimeMode: String as PropType<StationRuntimeMode>,
    stationId: { type: String, required: true },
    displayToken: { type: String, required: true },
    grantToken: String,
  },
  setup(props) {
    const feed = useStationOperatorFeed(props);
    const selectedId = ref<string | null>(null);
    const disclosures = ref<Record<string, StationVerificationDisclosure>>({});
    const disclosureError = ref<Error | null>(null);
    const isDisclosureLoading = ref(false);
    const selectedVerification = computed(() =>
      preferredVerification(feed.verifications.value, selectedId.value)
    );
    const selectedDisclosureKey = computed(() =>
      disclosureCacheKey({
        displayToken: props.displayToken,
        grantToken: props.grantToken,
        stationId: props.stationId,
        verificationId: selectedVerification.value?.verification_id,
      })
    );
    const selectedCachedDisclosure = computed(() =>
      selectedDisclosureKey.value
        ? disclosures.value[selectedDisclosureKey.value]
        : undefined
    );
    const selectedDisclosure = computed(() =>
      disclosureIsActive(selectedCachedDisclosure.value)
        ? selectedCachedDisclosure.value
        : undefined
    );

    watch(
      selectedVerification,
      (verification) => {
        if (verification && selectedId.value === null) {
          selectedId.value = verification.verification_id;
        }
      },
      { immediate: true }
    );

    watch(
      [() => props.stationId, () => props.displayToken, () => props.grantToken],
      () => {
        disclosures.value = {};
        disclosureError.value = null;
        isDisclosureLoading.value = false;
      }
    );

    watch(
      [selectedVerification, selectedDisclosureKey],
      async ([verification, cacheKey], _previous, onCleanup) => {
        let active = true;
        onCleanup(() => {
          active = false;
        });
        if (
          !(
            cacheKey &&
            verification?.status === "verified" &&
            !disclosures.value[cacheKey]
          )
        ) {
          return;
        }

        isDisclosureLoading.value = true;
        disclosureError.value = null;
        try {
          const disclosure = await feed.readDisclosure(
            verification.verification_id
          );
          if (!active) {
            return;
          }
          disclosures.value = {
            ...disclosures.value,
            [cacheKey]: disclosure,
          };
        } catch (cause) {
          if (!active) {
            return;
          }
          disclosureError.value =
            cause instanceof Error ? cause : new Error(String(cause));
        } finally {
          if (active) {
            isDisclosureLoading.value = false;
          }
        }
      },
      { immediate: true }
    );

    return () =>
      h("div", { "data-authbound-station-operator-console": "" }, [
        feed.error.value
          ? h("p", { role: "alert" }, feed.error.value.message)
          : null,
        h(
          "ol",
          feed.verifications.value.map((verification) =>
            h("li", { key: verification.verification_id }, [
              h(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    selectedId.value = verification.verification_id;
                  },
                },
                [
                  h("strong", verification.status),
                  " ",
                  h(
                    "span",
                    verification.outcome_reason ??
                      verification.failure_code ??
                      verification.verification_id
                  ),
                ]
              ),
            ])
          )
        ),
        selectedVerification.value
          ? h("section", { "data-authbound-station-operator-detail": "" }, [
              h("strong", selectedVerification.value.status),
              h("dl", [
                h("div", [
                  h("dt", "Age over 18"),
                  h(
                    "dd",
                    booleanLabel(
                      selectedVerification.value.assertions?.age_over_18
                    )
                  ),
                ]),
                h("div", [
                  h("dt", "Ticket valid"),
                  h(
                    "dd",
                    booleanLabel(
                      selectedVerification.value.assertions?.ticket_valid
                    )
                  ),
                ]),
              ]),
              selectedDisclosure.value
                ? h("div", { "data-authbound-station-disclosure": "" }, [
                    selectedDisclosure.value.fields.portrait
                      ? h("img", {
                          alt: "Verified portrait",
                          src: selectedDisclosure.value.fields.portrait,
                        })
                      : null,
                    h("dl", [
                      h("div", [
                        h("dt", "Given name"),
                        h(
                          "dd",
                          selectedDisclosure.value.fields.given_name ?? "--"
                        ),
                      ]),
                      h("div", [
                        h("dt", "Family name"),
                        h(
                          "dd",
                          selectedDisclosure.value.fields.family_name ?? "--"
                        ),
                      ]),
                      h("div", [
                        h("dt", "Birth date"),
                        h(
                          "dd",
                          selectedDisclosure.value.fields.birth_date ?? "--"
                        ),
                      ]),
                    ]),
                  ])
                : isDisclosureLoading.value
                  ? h("p", "Loading protected details")
                  : disclosureError.value
                    ? h("p", { role: "alert" }, disclosureError.value.message)
                    : props.grantToken
                      ? null
                      : h(
                          "p",
                          "Protected identity details require an operator device grant."
                        ),
            ])
          : null,
      ]);
  },
});
