// tsup.config.ts
import { defineConfig } from "tsup";
var tsup_config_default = defineConfig([
  // Main entry point (core utilities)
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    outDir: "dist",
    external: ["next", "next/server", "@authbound/core", "@authbound/shared"]
  },
  // Next.js specific entry point
  {
    entry: ["src/next/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    outDir: "dist/next",
    external: [
      "next",
      "next/server",
      "@authbound/core",
      "@authbound/shared",
      "jose"
    ]
  },
  // Express.js specific entry point
  {
    entry: ["src/express/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    outDir: "dist/express",
    external: ["express", "@authbound/core", "@authbound/shared", "jose"]
  },
  // Hono specific entry point
  {
    entry: ["src/hono/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    outDir: "dist/hono",
    external: [
      "hono",
      "hono/cookie",
      "@authbound/core",
      "@authbound/shared",
      "jose"
    ]
  },
  // Edge runtime entry point
  {
    entry: ["src/edge.ts"],
    format: ["esm"],
    dts: true,
    outDir: "dist",
    external: ["next", "next/server", "@authbound/core", "@authbound/shared"]
  }
]);
export {
  tsup_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidHN1cC5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9faW5qZWN0ZWRfZmlsZW5hbWVfXyA9IFwiL1VzZXJzL2xhc3NpL2Rldi9hdXRoYm91bmQtcG9ydGFsL3BhY2thZ2VzL3B1YmxpYy1zZGsvcGFja2FnZXMvc2VydmVyL3RzdXAuY29uZmlnLnRzXCI7Y29uc3QgX19pbmplY3RlZF9kaXJuYW1lX18gPSBcIi9Vc2Vycy9sYXNzaS9kZXYvYXV0aGJvdW5kLXBvcnRhbC9wYWNrYWdlcy9wdWJsaWMtc2RrL3BhY2thZ2VzL3NlcnZlclwiO2NvbnN0IF9faW5qZWN0ZWRfaW1wb3J0X21ldGFfdXJsX18gPSBcImZpbGU6Ly8vVXNlcnMvbGFzc2kvZGV2L2F1dGhib3VuZC1wb3J0YWwvcGFja2FnZXMvcHVibGljLXNkay9wYWNrYWdlcy9zZXJ2ZXIvdHN1cC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidHN1cFwiO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoW1xuICAvLyBNYWluIGVudHJ5IHBvaW50IChjb3JlIHV0aWxpdGllcylcbiAge1xuICAgIGVudHJ5OiBbXCJzcmMvaW5kZXgudHNcIl0sXG4gICAgZm9ybWF0OiBbXCJlc21cIiwgXCJjanNcIl0sXG4gICAgZHRzOiB0cnVlLFxuICAgIGNsZWFuOiB0cnVlLFxuICAgIG91dERpcjogXCJkaXN0XCIsXG4gICAgZXh0ZXJuYWw6IFtcIm5leHRcIiwgXCJuZXh0L3NlcnZlclwiLCBcIkBhdXRoYm91bmQvY29yZVwiLCBcIkBhdXRoYm91bmQvc2hhcmVkXCJdLFxuICB9LFxuICAvLyBOZXh0LmpzIHNwZWNpZmljIGVudHJ5IHBvaW50XG4gIHtcbiAgICBlbnRyeTogW1wic3JjL25leHQvaW5kZXgudHNcIl0sXG4gICAgZm9ybWF0OiBbXCJlc21cIiwgXCJjanNcIl0sXG4gICAgZHRzOiB0cnVlLFxuICAgIG91dERpcjogXCJkaXN0L25leHRcIixcbiAgICBleHRlcm5hbDogW1xuICAgICAgXCJuZXh0XCIsXG4gICAgICBcIm5leHQvc2VydmVyXCIsXG4gICAgICBcIkBhdXRoYm91bmQvY29yZVwiLFxuICAgICAgXCJAYXV0aGJvdW5kL3NoYXJlZFwiLFxuICAgICAgXCJqb3NlXCIsXG4gICAgXSxcbiAgfSxcbiAgLy8gRXhwcmVzcy5qcyBzcGVjaWZpYyBlbnRyeSBwb2ludFxuICB7XG4gICAgZW50cnk6IFtcInNyYy9leHByZXNzL2luZGV4LnRzXCJdLFxuICAgIGZvcm1hdDogW1wiZXNtXCIsIFwiY2pzXCJdLFxuICAgIGR0czogdHJ1ZSxcbiAgICBvdXREaXI6IFwiZGlzdC9leHByZXNzXCIsXG4gICAgZXh0ZXJuYWw6IFtcImV4cHJlc3NcIiwgXCJAYXV0aGJvdW5kL2NvcmVcIiwgXCJAYXV0aGJvdW5kL3NoYXJlZFwiLCBcImpvc2VcIl0sXG4gIH0sXG4gIC8vIEhvbm8gc3BlY2lmaWMgZW50cnkgcG9pbnRcbiAge1xuICAgIGVudHJ5OiBbXCJzcmMvaG9uby9pbmRleC50c1wiXSxcbiAgICBmb3JtYXQ6IFtcImVzbVwiLCBcImNqc1wiXSxcbiAgICBkdHM6IHRydWUsXG4gICAgb3V0RGlyOiBcImRpc3QvaG9ub1wiLFxuICAgIGV4dGVybmFsOiBbXG4gICAgICBcImhvbm9cIixcbiAgICAgIFwiaG9uby9jb29raWVcIixcbiAgICAgIFwiQGF1dGhib3VuZC9jb3JlXCIsXG4gICAgICBcIkBhdXRoYm91bmQvc2hhcmVkXCIsXG4gICAgICBcImpvc2VcIixcbiAgICBdLFxuICB9LFxuICAvLyBFZGdlIHJ1bnRpbWUgZW50cnkgcG9pbnRcbiAge1xuICAgIGVudHJ5OiBbXCJzcmMvZWRnZS50c1wiXSxcbiAgICBmb3JtYXQ6IFtcImVzbVwiXSxcbiAgICBkdHM6IHRydWUsXG4gICAgb3V0RGlyOiBcImRpc3RcIixcbiAgICBleHRlcm5hbDogW1wibmV4dFwiLCBcIm5leHQvc2VydmVyXCIsIFwiQGF1dGhib3VuZC9jb3JlXCIsIFwiQGF1dGhib3VuZC9zaGFyZWRcIl0sXG4gIH0sXG5dKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNlYsU0FBUyxvQkFBb0I7QUFFMVgsSUFBTyxzQkFBUSxhQUFhO0FBQUE7QUFBQSxFQUUxQjtBQUFBLElBQ0UsT0FBTyxDQUFDLGNBQWM7QUFBQSxJQUN0QixRQUFRLENBQUMsT0FBTyxLQUFLO0FBQUEsSUFDckIsS0FBSztBQUFBLElBQ0wsT0FBTztBQUFBLElBQ1AsUUFBUTtBQUFBLElBQ1IsVUFBVSxDQUFDLFFBQVEsZUFBZSxtQkFBbUIsbUJBQW1CO0FBQUEsRUFDMUU7QUFBQTtBQUFBLEVBRUE7QUFBQSxJQUNFLE9BQU8sQ0FBQyxtQkFBbUI7QUFBQSxJQUMzQixRQUFRLENBQUMsT0FBTyxLQUFLO0FBQUEsSUFDckIsS0FBSztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsVUFBVTtBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQTtBQUFBLEVBRUE7QUFBQSxJQUNFLE9BQU8sQ0FBQyxzQkFBc0I7QUFBQSxJQUM5QixRQUFRLENBQUMsT0FBTyxLQUFLO0FBQUEsSUFDckIsS0FBSztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsVUFBVSxDQUFDLFdBQVcsbUJBQW1CLHFCQUFxQixNQUFNO0FBQUEsRUFDdEU7QUFBQTtBQUFBLEVBRUE7QUFBQSxJQUNFLE9BQU8sQ0FBQyxtQkFBbUI7QUFBQSxJQUMzQixRQUFRLENBQUMsT0FBTyxLQUFLO0FBQUEsSUFDckIsS0FBSztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsVUFBVTtBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQTtBQUFBLEVBRUE7QUFBQSxJQUNFLE9BQU8sQ0FBQyxhQUFhO0FBQUEsSUFDckIsUUFBUSxDQUFDLEtBQUs7QUFBQSxJQUNkLEtBQUs7QUFBQSxJQUNMLFFBQVE7QUFBQSxJQUNSLFVBQVUsQ0FBQyxRQUFRLGVBQWUsbUJBQW1CLG1CQUFtQjtBQUFBLEVBQzFFO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
