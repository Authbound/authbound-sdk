import { VerificationWall as VueVerificationWall } from "@authbound/vue";
import { defineComponent, h, type Component } from "vue";

export const VerificationWall = defineComponent({
  name: "AuthboundVerificationWall",
  setup(_, { attrs, slots }) {
    return () => h(VueVerificationWall as Component, attrs, slots);
  },
});
