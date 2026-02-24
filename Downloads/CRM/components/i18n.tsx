"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "sv" | "en";
const LANG_KEY = "vendora-crm-lang";

type Dict = Record<string, string>;

const STRINGS: Record<Lang, Dict> = {
  sv: {
    brandTitle: "Vendora Nordic CRM",
    brandSubtitle: "Kunder, kontakter och planer",
    navOverview: "Översikt",
    navCustomers: "Kunder",
    navContacts: "Kontakter",
    navPlans: "Planer",
    navAdmin: "Admin",
    langSv: "Svenska",
    langEn: "English",
    overviewTitle: "CRM Overview",
    overviewDesc: "Hög-nivå implementation med Next.js, Prisma och PostgreSQL, förberedd för Railway.",
    customers: "Kunder",
    contacts: "Kontakter",
    plans: "Planer",
    dbMissing: "Databasen är inte ansluten ännu. Lägg in DATABASE_URL och kör Prisma-migration.",
    nextSteps: "Nästa steg",
    nextStepsDesc: "Lägg till autentisering, roller, aktivitetslogg och integration mot försäljningsstatistik via API.",
    loading: "Laddar...",
    save: "Spara",
    saving: "Sparar...",
    list: "Lista",
    noCustomers: "Inga kunder ännu.",
    noContacts: "Inga kontakter ännu.",
    noPlans: "Inga planer ännu.",
    customerNew: "Ny kund",
    customerTitle: "Kunder",
    customerDesc: "Lägg till kunder och grunddata för framtida CRM- och försäljningskoppling.",
    name: "Namn",
    organization: "Organisation",
    industry: "Bransch",
    email: "E-post",
    phone: "Telefon",
    saveCustomer: "Spara kund",
    noOrganization: "Ingen organisation",
    contactNew: "Ny kontakt",
    contactTitle: "Kontakter",
    contactDesc: "Koppla kontakter till kunder och bygg kommunikationen strukturerat.",
    firstName: "Förnamn",
    lastName: "Efternamn",
    role: "Roll",
    chooseCustomer: "Välj kund",
    saveContact: "Spara kontakt",
    noRole: "Ingen roll",
    planTitle: "Planer / Projekt",
    planDesc: "Hantera kundplaner med status, ansvarig och framtida statistik-integration via API.",
    planNew: "Ny plan",
    title: "Titel",
    owner: "Ansvarig",
    description: "Beskrivning",
    savePlan: "Spara plan",
    statusPlanned: "Planerad",
    statusInProgress: "Pågående",
    statusOnHold: "Pausad",
    statusCompleted: "Klar"
  },
  en: {
    brandTitle: "Vendora Nordic CRM",
    brandSubtitle: "Customers, contacts and plans",
    navOverview: "Overview",
    navCustomers: "Customers",
    navContacts: "Contacts",
    navPlans: "Plans",
    navAdmin: "Admin",
    langSv: "Svenska",
    langEn: "English",
    overviewTitle: "CRM Overview",
    overviewDesc: "High-level implementation with Next.js, Prisma and PostgreSQL, prepared for Railway.",
    customers: "Customers",
    contacts: "Contacts",
    plans: "Plans",
    dbMissing: "Database is not connected yet. Set DATABASE_URL and run Prisma migration.",
    nextSteps: "Next steps",
    nextStepsDesc: "Add authentication, roles, activity logging and sales-statistics API integration.",
    loading: "Loading...",
    save: "Save",
    saving: "Saving...",
    list: "List",
    noCustomers: "No customers yet.",
    noContacts: "No contacts yet.",
    noPlans: "No plans yet.",
    customerNew: "New customer",
    customerTitle: "Customers",
    customerDesc: "Add customers and core data for future CRM and sales integrations.",
    name: "Name",
    organization: "Organization",
    industry: "Industry",
    email: "Email",
    phone: "Phone",
    saveCustomer: "Save customer",
    noOrganization: "No organization",
    contactNew: "New contact",
    contactTitle: "Contacts",
    contactDesc: "Link contacts to customers and structure communication.",
    firstName: "First name",
    lastName: "Last name",
    role: "Role",
    chooseCustomer: "Choose customer",
    saveContact: "Save contact",
    noRole: "No role",
    planTitle: "Plans / Projects",
    planDesc: "Manage customer plans with status, owner and future API integrations.",
    planNew: "New plan",
    title: "Title",
    owner: "Owner",
    description: "Description",
    savePlan: "Save plan",
    statusPlanned: "Planned",
    statusInProgress: "In progress",
    statusOnHold: "On hold",
    statusCompleted: "Completed"
  }
};

type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("sv");

  useEffect(() => {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "sv" || stored === "en") {
      setLang(stored);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nContextValue>(() => {
    return {
      lang,
      setLang,
      t: (key: string) => STRINGS[lang][key] ?? key
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside LanguageProvider");
  }

  return context;
}
