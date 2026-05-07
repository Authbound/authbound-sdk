import {
  StatusBadge as VueStatusBadge,
  VerificationStatus as VueVerificationStatus,
} from "@authbound/vue";
import { defineComponent, h, type Component } from "vue";

export const StatusBadge = defineComponent({
  name: "AuthboundStatusBadge",
  setup(_, { attrs, slots }) {
    return () => h(VueStatusBadge as Component, attrs, slots);
  },
});

export const VerificationStatus = defineComponent({
  name: "AuthboundVerificationStatus",
  setup(_, { attrs, slots }) {
    return () => h(VueVerificationStatus as Component, attrs, slots);
  },
});
