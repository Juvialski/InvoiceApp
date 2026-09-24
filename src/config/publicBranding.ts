/**
 * Public audiences deliberately use separate identity/content records.
 * `BRAND` remains the authenticated workspace identity.
 */
export const HYDROQUALISENSE_PUBLIC_SITE = Object.freeze({
  identity: Object.freeze({
    companyName: "Hydroqualisense Solutions Corp.",
    logoPath: "/brand/hydroqualisense-logo.png",
    canonicalOrigin: "https://hydroqualisense.com",
  }),
  metadata: Object.freeze({
    title: "Hydroqualisense Solutions Corp. | Water & Engineering",
    description: "Hydroqualisense Solutions Corp. is an engineering company focused on water treatment, water management, and related engineering projects.",
  }),
  services: Object.freeze([
    Object.freeze({
      id: "water-treatment",
      title: "Water treatment",
      description: "Engineering work focused on water treatment needs and the requirements of each project.",
      icon: "droplet",
    }),
    Object.freeze({
      id: "water-management",
      title: "Water management",
      description: "Water management considered in the context of the project, its use, and its operating needs.",
      icon: "waves",
    }),
    Object.freeze({
      id: "related-engineering",
      title: "Related engineering projects",
      description: "Engineering project work shaped around confirmed water-related needs and project requirements.",
      icon: "compass",
    }),
  ]),
  projectReferences: Object.freeze([] as PublicCompanyProjectReference[]),
  projectReferencesPending: "Public project references and photography will be added only after the company approves the specific materials.",
  contact: Object.freeze({
    email: null as string | null,
    phone: null as string | null,
    location: null as string | null,
  }),
  contactPending: "A public project inquiry email and telephone number are pending company confirmation.",
});

export const QA_SOFTWARE_SHOWCASE = Object.freeze({
  softwareIdentity: Object.freeze({
    productBrand: null as string | null,
    creatorBrand: null as string | null,
    neutralDescriptor: "Engineering Operations Platform",
    label: "QA Software Showcase",
  }),
  metadata: Object.freeze({
    title: "Engineering Operations Platform | QA Software Showcase",
    description: "A non-production software showcase for engineering operations, using synthetic demo context.",
  }),
  disclosure: "QA software showcase using synthetic engineering-company data. Not the production corporate services website.",
  capabilities: Object.freeze([
    Object.freeze({ id: "projects", title: "Project operations", description: "Explore project context, costs, tasks, and coordination." }),
    Object.freeze({ id: "procurement", title: "Procurement", description: "Follow purchasing, commitments, receipts, and supporting records." }),
    Object.freeze({ id: "supplier-finance", title: "Supplier invoices and expenses", description: "Review source evidence and related expense workflows." }),
    Object.freeze({ id: "financial-workflows", title: "Financial workflows", description: "See how review, approval, and settlement remain distinct steps." }),
    Object.freeze({ id: "documents", title: "Documents and history", description: "Browse project records with visible source and revision context." }),
    Object.freeze({ id: "operations", title: "Workforce and operations", description: "Explore payroll, inventory, equipment, and business communications surfaces." }),
  ]),
});

export type PublicSiteVariant = "company" | "software-showcase";

export interface PublicCompanyProjectReference {
  id: string;
  title: string;
  service: string;
  summary: string;
  location: string | null;
  image: { src: string; alt: string } | null;
}
