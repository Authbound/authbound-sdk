import {
  QRCode as VueQRCode,
  QRCodeWithLoading as VueQRCodeWithLoading,
} from "@authbound/vue";
import { defineComponent, h, type Component } from "vue";

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
