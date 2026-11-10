/* Shapes returned by the database functions (supabase/migrations). Kept in one place so
   every screen reads the same names. Money values are always worked out by the database. */

export type Role = "owner" | "manager" | "waiter" | "kitchen";
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
};

export type OrderItem = { name: string; size: string; addons: string[]; qty: number; diet: Diet; note: string; amount: number };
export type Order = {
  id: string; no: number; status: OrderStatus; source: "guest" | "staff"; note: string;
  created_at: string; started_at: string | null; ready_at: string | null; served_at: string | null; cancel_reason: string;
  items: OrderItem[];
};

export type LiveTable = { id: string; code: string; name: string; area: string; seats: number; active: boolean };
export type LiveVisit = {
  id: string; table_id: string; status: VisitStatus; opened_at: string; bill_at: string | null;
  guests: number | null; split: number; tip_pct: number; pay_choice: "" | "upi" | "cash" | "card";
  bill: Bill; orders: Order[];
};
export type LiveCall = { id: string; table_id: string; kind: "waiter" | "water" | "bill" | "help"; at: string; seen_at: string | null; seen_by: string | null };
export type Live = {
  now: string; role: Role; restaurant_id?: string;
  settings: { name: string; currency: string; accepting: boolean; gst_pct: number; service_pct: number; upi_id: string; upi_name: string };
  tables: LiveTable[]; visits: LiveVisit[]; calls: LiveCall[];
  today: { sales: number; bills: number; orders: number; guests: number; rating: number | null; flow: Record<string, number> };
};

export type MenuCategory = { id: string; name: string; sort: number; active: boolean };
export type MenuItem = {
  id: string; category_id: string; name: string; description: string; price: number; diet: Diet; spice: number | null;
  allergens: string[]; sizes: { name: string; price: number }[]; addons: { name: string; price: number }[];
  photo_url: string; bestseller: boolean; available: boolean; sort: number;
};
export type StaffMenu = { categories: MenuCategory[]; items: MenuItem[] };

export type Report = {
  sales: number; tips: number; gst: number; bills: number; guests: number; voids: number;
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
  last_paid: { id: string; paid_at: string; total: number; reviewed: boolean } | null;
  visit: null | {
    id: string; status: VisitStatus; guests: number | null; split: number; tip_pct: number; pay_choice: string;
    orders: Order[]; calls: { kind: string; at: string; seen: boolean }[]; bill: Bill;
    wifi: { name: string; password: string } | null; upi: { id: string; name: string } | null;
  };
};

export type CartLine = { key: string; id: string; name: string; qty: number; size?: string; addons?: string[]; unit: number; note?: string };
