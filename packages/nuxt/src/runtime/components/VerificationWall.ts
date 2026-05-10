import { VerificationWall as VueVerificationWall } from "@authbound/vue";
import { type Component, defineComponent, h } from "vue";

export const VerificationWall = defineComponent({
  name: "AuthboundVerificationWall",
  setup(_, { attrs, slots }) {
    return () => h(VueVerificationWall as Component, attrs, slots);
  },
});
