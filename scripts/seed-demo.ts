// Fill a local database with demo users and one sourced role: `npm run seed:demo`
// Uses PGLITE_DIR (default .data/pglite). Mock mode only; never run against production.
/* eslint-disable @typescript-eslint/no-explicit-any -- script reads untyped JSON responses */
process.env.DEMO_MODE = "true";
for (const k of ["DATABASE_URL", "ANTHROPIC_API_KEY", "PDL_API_KEY", "SIGNALHIRE_API_KEY", "RESEND_API_KEY"]) delete process.env[k];

const { default: app } = await import("../server/app.js");

function client() {
  let cookie = "";
  return async (method: string, url: string, body?: unknown) => {
    const res = await app.fetch(new Request(`http://localhost/api${url}`, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }));
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json)}`);
    return json as any;
  };
}

const admin = client();
if ((await admin("GET", "/setup")).needsSetup) {
  await admin("POST", "/setup", {
    adminName: "Demo Admin", adminEmail: "demo.admin@york-press.test", adminPassword: "demo-york-2026",
    ceoName: "Khalil Sayegh", ceoEmail: "khalil.sayegh@york-press.com", managers: [],
  });
} else {
  await admin("POST", "/auth/login", { email: "demo.recruiter@york-press.test", password: "demo-york-2026" });
}

const manager = client();
await manager("POST", "/auth/login", { email: "demo.manager@york-press.test", password: "demo-york-2026" });
const role = await manager("POST", "/requests?submit=true", {
  title: "Senior Product Designer", department: "Product & Technology", seniority: "Senior", headcount: 1,
  jdText: "Own the design of York-E, our digital learning platform used by schools across the region.",
  mustHaves: ["Figma", "Design systems", "User research"], niceToHaves: ["Edtech or publishing"], dealBreakers: [],
  minYears: 5, idealYears: 8, languages: ["English", "Arabic"], locationPolicy: "Remote, MENA time zones", searchLocations: ["Lebanon"],
  salaryMin: 45000, salaryMax: 65000, currency: "USD", justification: "York-E needs a dedicated designer.",
});
await manager("POST", "/requests?submit=true", {
  title: "Finance Manager", department: "Finance", seniority: "Manager", headcount: 1, jdText: "Lead month-end close and budgeting.",
  mustHaves: ["IFRS", "Budgeting"], niceToHaves: [], dealBreakers: [], minYears: 7, idealYears: 10, languages: ["English"],
  locationPolicy: "Remote", searchLocations: [], salaryMin: 60000, salaryMax: 80000, currency: "USD", justification: "Backfill.",
});

const ceo = client();
await ceo("POST", "/auth/login", { email: "demo.ceo@york-press.test", password: "demo-york-2026" });
await ceo("POST", `/requests/${role.id}/decision`, { action: "approve" });
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 200));
  if ((await admin("GET", `/requests/${role.id}`)).request.status === "open") break;
}
console.log("Demo data ready. Sign in with any demo.*@york-press.test account, password demo-york-2026.");
process.exit(0);
