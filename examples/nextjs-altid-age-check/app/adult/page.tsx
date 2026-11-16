import { redirect } from "next/navigation";
import { isOver18 } from "@/lib/age-session";

export const dynamic = "force-dynamic";

export default async function AdultPage() {
  if (!(await isOver18())) redirect("/");

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        margin: "4rem auto",
        maxWidth: 420,
      }}
    >
      <h1>18+ content</h1>
      <p>
        Your server checked a signed AltID answer before it showed this page.
      </p>
    </main>
  );
}
