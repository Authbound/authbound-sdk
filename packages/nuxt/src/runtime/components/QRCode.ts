import {
  QRCode as VueQRCode,
  QRCodeWithLoading as VueQRCodeWithLoading,
} from "@authbound/vue";
import { type Component, defineComponent, h } from "vue";

export const QRCode = defineComponent({
  name: "AuthboundQRCode",
  setup(_, { attrs, slots }) {
    return () => h(VueQRCode as Component, attrs, slots);
  },
});

export const QRCodeWithLoading = defineComponent({
  name: "AuthboundQRCodeWithLoading",
  setup(_, { attrs, slots }) {
    return () => h(VueQRCodeWithLoading as Component, attrs, slots);
  },
});
