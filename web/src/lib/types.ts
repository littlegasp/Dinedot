/* Shapes returned by the database functions (supabase/migrations). Kept in one place so
   every screen reads the same names. Money values are always worked out by the database. */

export type Role = "owner" | "manager" | "cashier" | "waiter" | "kitchen";
export type Diet = "veg" | "nonveg" | "egg";
export type OrderStatus = "new" | "cooking" | "ready" | "served" | "cancelled";
export type VisitStatus = "open" | "bill" | "paid" | "void";
export type PayMethod = "upi" | "cash" | "card" | "mixed";

export type Me = {
  id: string; name: string; email: string; role: Role | null; active: boolean;
  restaurant_id: string | null; restaurant: string | null; restaurants: number;
} | null;

export type RestaurantRow = { id: string; name: string; role: Role; active: boolean; current: boolean };

export type Bill = {
  lines: { name: string; size: string; addons: string[]; qty: number; amount: number }[];
  subtotal: number; service: number; gst: number; tip: number; total: number; grand: number;
  split: number; each: number; tip_pct: number; service_pct: number; gst_pct: number;
  /* 0005: discount comes off the subtotal before service, GST and tip */
  discount?: number; discount_kind?: "pct" | "amount" | null; discount_value?: number; discount_reason?: string;
  payments?: { method: PayMethod; amount: number; reference: string }[];   // paid bills only
};
export type PayPart = { method: "upi" | "cash" | "card"; amount: number; reference?: string };

export type OrderItem = { id: number; name: string; size: string; addons: string[]; qty: number; diet: Diet; note: string; amount: number; station: string; done: boolean };
export type Order = {
  id: string; no: number; status: OrderStatus; source: "guest" | "staff"; note: string;
  created_at: string; started_at: string | null; ready_at: string | null; served_at: string | null; cancel_reason: string;
  items: OrderItem[];
};

export type LiveTable = { id: string; code: string; name: string; area: string; seats: number; active: boolean };
export type LiveVisit = {
  id: string; table_id: string | null; kind: "dine_in" | "takeaway"; token: number | null; status: VisitStatus; opened_at: string; bill_at: string | null;
  guests: number | null; split: number; tip_pct: number; pay_choice: "" | "upi" | "cash" | "card";
  bill: Bill; orders: Order[];
};
export type LiveCall = { id: string; table_id: string; kind: "waiter" | "water" | "bill" | "help"; at: string; seen_at: string | null; seen_by: string | null };
export type Live = {
  now: string; role: Role; restaurant_id?: string;
  settings: { name: string; currency: string; accepting: boolean; gst_pct: number; service_pct: number; upi_id: string; upi_name: string;
    stations: string[]; max_discount_pct: number; notice: { text: string; at: string; by: string } | null; day_closed: boolean };
  tables: LiveTable[]; visits: LiveVisit[]; calls: LiveCall[];
  today: { sales: number; bills: number; orders: number; guests: number; rating: number | null; flow: Record<string, number> };
};

export type MenuCategory = { id: string; name: string; sort: number; active: boolean; station: string };
export type MenuItem = {
  id: string; category_id: string; name: string; description: string; price: number; diet: Diet; spice: number | null;
  allergens: string[]; sizes: { name: string; price: number }[]; addons: { name: string; price: number }[];
  photo_url: string; bestseller: boolean; available: boolean; sort: number; station: string;
};
export type StaffMenu = { categories: MenuCategory[]; items: MenuItem[] };

export type Report = {
  sales: number; tips: number; gst: number; discounts?: number; bills: number; guests: number; voids: number;
  by_day: { day: string; sales: number; bills: number }[]; by_hour: Record<string, number>;
  methods: Partial<Record<PayMethod, number>>; top: { name: string; qty: number; amount: number }[];
  prep_mins: number | null; rating: number | null; ratings: number;
};

export type GuestMenu = {
  table: { code: string; name: string };
  place: {
    name: string; tagline: string; currency: string; accent: string; cover: string; accepting: boolean; closed_message: string;
    welcome: string; gst_pct: number; service_pct: number; tips: number[]; pay: { upi: boolean; cash: boolean; card: boolean };
    has_wifi: boolean; review_url: string;
  };
  categories: { id: string; name: string }[];
  items: { id: string; cat: string; name: string; desc: string; price: number; diet: Diet; spice: number | null; allergens: string[];
           sizes: { name: string; price: number }[]; addons: { name: string; price: number }[]; photo: string; best: boolean; available: boolean }[];
};
export type GuestState = {
  now: string;
  last_paid: { id: string; paid_at: string; total: number; reviewed: boolean; receipt?: import("./receipt").Receipt } | null;
  visit: null | {
    id: string; status: VisitStatus; guests: number | null; split: number; tip_pct: number; pay_choice: string;
    orders: Order[]; calls: { kind: string; at: string; seen: boolean }[]; bill: Bill;
    wifi: { name: string; password: string } | null; upi: { id: string; name: string } | null;
  };
};

export type CartLine = { key: string; id: string; name: string; qty: number; size?: string; addons?: string[]; unit: number; note?: string };

export type Settings = {
  restaurant_name: string; tagline: string; currency: string; accent: string; cover_url: string;
  accepting_orders: boolean; closed_message: string; wifi_name: string; wifi_password: string;
  upi_id: string; upi_name: string; gst_pct: number; service_pct: number; tip_options: number[];
  pay_cash: boolean; pay_card: boolean; pay_upi: boolean; google_review_url: string; welcome_note: string;
  stations: string[]; max_discount_pct: number;
  legal_name: string; bill_address: string; gstin: string; fssai: string; sac: string; gst_composition: boolean;
  invoice_prefix: string; bill_footer: string; receipt_width: 58 | 80;
};

export type TeamMember = { id: string; name: string; email: string; phone: string; role: Role; active: boolean; created_at: string };

export type BillRow = {
  id: string; table: string; kind?: "dine_in" | "takeaway"; discount?: number; invoice_no?: string | null; gst?: number; opened_at: string; paid_at: string | null; status: "paid" | "void"; method: PayMethod | null;
  total: number; tip: number; guests: number | null; void_reason: string; by: string | null; bill: Bill; ref: string | null; stars: number | null;
};

export type DayClose = {
  id: string; day: string; opening_cash: number; cash_sales: number; upi_sales: number; card_sales: number; sales: number; bills: number;
  discounts: number; tips: number; paid_out: number; expected: number; counted: number; difference: number; note: string;
  closed_by_name: string; closed_at: string;
};
export type DaySummary = {
  day: string; today: string; closed: DayClose | null; methods: { cash: number; upi: number; card: number };
  sales: number; bills: number; discounts: number; tips: number; voids: number; open: number; recent: DayClose[];
};
