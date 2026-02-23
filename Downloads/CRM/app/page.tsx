import { prisma } from "@/lib/prisma";

async function getStats() {
  if (!process.env.DATABASE_URL) {
    return { customers: 0, contacts: 0, plans: 0, available: false };
  }

  try {
    const [customers, contacts, plans] = await Promise.all([
      prisma.customer.count(),
      prisma.contact.count(),
      prisma.plan.count()
    ]);

    return { customers, contacts, plans, available: true };
  } catch {
    return { customers: 0, contacts: 0, plans: 0, available: false };
  }
}

export default async function HomePage() {
  const stats = await getStats();

  return (
    <>
      <section className="crm-card">
        <h2>CRM Overview</h2>
        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
          Hög-nivå implementation med Next.js, Prisma och PostgreSQL, förberedd för Railway-deploy.
        </p>
      </section>

      <section className="crm-grid" style={{ marginTop: "1rem" }}>
        <article className="crm-card">
          <h3>Kunder</h3>
          <p className="crm-stat">{stats.customers}</p>
        </article>
        <article className="crm-card">
          <h3>Kontakter</h3>
          <p className="crm-stat">{stats.contacts}</p>
        </article>
        <article className="crm-card">
          <h3>Planer</h3>
          <p className="crm-stat">{stats.plans}</p>
        </article>
      </section>

      {!stats.available ? (
        <section className="crm-card" style={{ marginTop: "1rem" }}>
          <p className="crm-subtle">
            Databasen är inte ansluten ännu. Lägg in <code>DATABASE_URL</code> och kör Prisma-migration.
          </p>
        </section>
      ) : null}

      <section className="crm-card" style={{ marginTop: "1rem" }}>
        <h3>Nästa steg</h3>
        <p className="crm-subtle" style={{ marginTop: "0.45rem" }}>
          Lägg till autentisering, roller, aktivitetslogg och integration mot försäljningsstatistik via API.
        </p>
      </section>
    </>
  );
}
