/* Synthetic data for the design prototype only. The real app reads everything from Supabase,
   and money always comes from SQL (price_cart / visit_bill). Nothing here is a real person. */

export type Diet = "veg" | "nonveg" | "egg";
export type Station = "Tandoor" | "Curry" | "Bar" | "Dessert";
export type Dish = { id: string; name: string; desc: string; price: number; diet: Diet; cat: string; station: Station; photo: string; best?: boolean; spice?: number; soldOut?: boolean; sizes?: { name: string; price: number }[]; addons?: { name: string; price: number }[] };

const p = (slug: string) => `img/menu/${slug}.jpg`;

export const CATEGORIES = ["Starters", "Mains", "Breads & rice", "Drinks", "Desserts"] as const;

export const MENU: Dish[] = [
  { id: "d1", name: "Paneer Tikka", desc: "Charred cottage cheese, peppers and onion, mint chutney", price: 290, diet: "veg", cat: "Starters", station: "Tandoor", photo: p("paneer-tikka"), best: true, spice: 2, addons: [{ name: "Extra chutney", price: 20 }] },
  { id: "d2", name: "Chicken Seekh Kebab", desc: "Minced chicken, herbs, straight off the skewer", price: 340, diet: "nonveg", cat: "Starters", station: "Tandoor", photo: p("chicken-seekh-kebab"), spice: 2 },
  { id: "d3", name: "Tandoori Prawns", desc: "Ajwain, lemon and smoked chilli", price: 520, diet: "nonveg", cat: "Starters", station: "Tandoor", photo: p("tandoori-prawns"), spice: 2 },
  { id: "d4", name: "Crispy Corn", desc: "Pepper, curry leaf and lime", price: 220, diet: "veg", cat: "Starters", station: "Curry", photo: p("crispy-corn"), spice: 1 },
  { id: "d5", name: "Chicken Karahi", desc: "Slow-cooked with tomato, ginger and green chilli", price: 420, diet: "nonveg", cat: "Mains", station: "Curry", photo: p("chicken-karahi"), best: true, spice: 3, sizes: [{ name: "Half", price: 260 }, { name: "Full", price: 420 }] },
  { id: "d6", name: "Dal Makhani", desc: "Black lentils simmered overnight with butter and cream", price: 280, diet: "veg", cat: "Mains", station: "Curry", photo: p("dal-makhani"), best: true, spice: 1, addons: [{ name: "Extra butter", price: 30 }] },
  { id: "d7", name: "Paneer Butter Masala", desc: "Silky tomato gravy, kasuri methi", price: 320, diet: "veg", cat: "Mains", station: "Curry", photo: p("paneer-butter-masala"), spice: 1 },
  { id: "d8", name: "Mutton Rogan Josh", desc: "Kashmiri chilli, fennel, slow braise", price: 480, diet: "nonveg", cat: "Mains", station: "Curry", photo: p("mutton-rogan-josh"), spice: 3, soldOut: true },
  { id: "d9", name: "Egg Curry", desc: "Two eggs in an onion-tomato masala", price: 240, diet: "egg", cat: "Mains", station: "Curry", photo: p("egg-curry"), spice: 2 },
  { id: "d10", name: "Chicken Biryani", desc: "Dum-cooked basmati, saffron, raita", price: 380, diet: "nonveg", cat: "Mains", station: "Curry", photo: p("chicken-biryani"), best: true, spice: 2 },
  { id: "d11", name: "Butter Naan", desc: "Tandoor-baked, brushed with butter", price: 60, diet: "veg", cat: "Breads & rice", station: "Tandoor", photo: p("butter-naan"), addons: [{ name: "Garlic", price: 15 }] },
  { id: "d12", name: "Tandoori Roti", desc: "Whole wheat, from the clay oven", price: 40, diet: "veg", cat: "Breads & rice", station: "Tandoor", photo: p("tandoori-roti") },
  { id: "d13", name: "Jeera Rice", desc: "Basmati tempered with cumin", price: 180, diet: "veg", cat: "Breads & rice", station: "Curry", photo: p("jeera-rice") },
  { id: "d14", name: "Mint Lemonade", desc: "Fresh lime, mint and soda", price: 120, diet: "veg", cat: "Drinks", station: "Bar", photo: p("mint-lemonade"), sizes: [{ name: "Glass", price: 120 }, { name: "Jug", price: 320 }] },
  { id: "d15", name: "Masala Chaas", desc: "Spiced buttermilk", price: 90, diet: "veg", cat: "Drinks", station: "Bar", photo: p("masala-chaas") },
  { id: "d16", name: "Cutting Chai", desc: "Strong, sweet, small", price: 50, diet: "veg", cat: "Drinks", station: "Bar", photo: p("cutting-chai") },
  { id: "d17", name: "Gulab Jamun", desc: "Two warm dumplings in rose syrup", price: 140, diet: "veg", cat: "Desserts", station: "Dessert", photo: p("gulab-jamun"), addons: [{ name: "Vanilla scoop", price: 60 }] },
  { id: "d18", name: "Kulfi Falooda", desc: "Malai kulfi, vermicelli, rose", price: 190, diet: "veg", cat: "Desserts", station: "Dessert", photo: p("kulfi-falooda") },
];
export const dish = (id: string) => MENU.find(d => d.id === id)!;

/* Floor ------------------------------------------------------------------------------- */
export type TableState = "free" | "seated" | "ordered" | "food" | "bill" | "cleaning";
export type Table = { id: string; name: string; area: "Main hall" | "Terrace"; seats: number; state: TableState; guests?: number; mins?: number; total?: number; waiter?: string; call?: "waiter" | "bill" | "water" };

export const TABLES: Table[] = [
  { id: "T1", name: "T1", area: "Main hall", seats: 2, state: "free" },
  { id: "T2", name: "T2", area: "Main hall", seats: 4, state: "ordered", guests: 3, mins: 12, total: 1240, waiter: "Ravi" },
  { id: "T3", name: "T3", area: "Main hall", seats: 4, state: "food", guests: 4, mins: 38, total: 2180, waiter: "Ravi", call: "water" },
  { id: "T4", name: "T4", area: "Main hall", seats: 6, state: "bill", guests: 5, mins: 64, total: 3460, waiter: "Meera", call: "bill" },
  { id: "T5", name: "T5", area: "Main hall", seats: 2, state: "seated", guests: 2, mins: 3, waiter: "Meera" },
  { id: "T6", name: "T6", area: "Main hall", seats: 4, state: "cleaning" },
  { id: "T7", name: "T7", area: "Main hall", seats: 8, state: "ordered", guests: 7, mins: 21, total: 4120, waiter: "Ravi", call: "waiter" },
  { id: "T8", name: "T8", area: "Main hall", seats: 2, state: "free" },
  { id: "P1", name: "P1", area: "Terrace", seats: 4, state: "food", guests: 2, mins: 29, total: 1460, waiter: "Arjun" },
  { id: "P2", name: "P2", area: "Terrace", seats: 4, state: "free" },
  { id: "P3", name: "P3", area: "Terrace", seats: 6, state: "ordered", guests: 4, mins: 8, total: 1890, waiter: "Arjun" },
  { id: "P4", name: "P4", area: "Terrace", seats: 2, state: "free" },
];

/* Kitchen tickets ---------------------------------------------------------------------- */
export type TicketItem = { dish: string; qty: number; note?: string; mods?: string; done?: boolean };
export type Ticket = { id: string; no: number; table: string; kind: "Dine-in" | "Takeaway" | "QR"; mins: number; status: "new" | "cooking" | "ready"; items: TicketItem[]; allergy?: string };

export const TICKETS: Ticket[] = [
  { id: "k1", no: 214, table: "T7", kind: "QR", mins: 1, status: "new", items: [{ dish: "d1", qty: 2 }, { dish: "d11", qty: 4, mods: "Garlic" }, { dish: "d14", qty: 1, mods: "Jug" }], allergy: "One guest: no nuts" },
  { id: "k2", no: 213, table: "P3", kind: "Dine-in", mins: 4, status: "new", items: [{ dish: "d10", qty: 2 }, { dish: "d15", qty: 2 }] },
  { id: "k3", no: 211, table: "T2", kind: "QR", mins: 9, status: "cooking", items: [{ dish: "d5", qty: 1, mods: "Full", done: true }, { dish: "d6", qty: 1 }, { dish: "d12", qty: 3, done: true }] },
  { id: "k4", no: 209, table: "#A12", kind: "Takeaway", mins: 13, status: "cooking", items: [{ dish: "d7", qty: 1 }, { dish: "d13", qty: 1 }, { dish: "d11", qty: 2 }], allergy: "Less spicy" },
  { id: "k5", no: 207, table: "T3", kind: "Dine-in", mins: 19, status: "cooking", items: [{ dish: "d2", qty: 1 }, { dish: "d3", qty: 1, note: "Well done" }] },
  { id: "k6", no: 205, table: "P1", kind: "QR", mins: 24, status: "ready", items: [{ dish: "d17", qty: 2, done: true }, { dish: "d18", qty: 1, done: true }] },
];

/* Owner dashboard ---------------------------------------------------------------------- */
export const HOURLY = [
  { h: "12", today: 4200, last: 3600 }, { h: "13", today: 9800, last: 8400 }, { h: "14", today: 7600, last: 7900 },
  { h: "15", today: 3100, last: 2800 }, { h: "16", today: 2400, last: 2600 }, { h: "17", today: 3300, last: 3000 },
  { h: "18", today: 6100, last: 5200 }, { h: "19", today: 11800, last: 9700 }, { h: "20", today: 14200, last: 12900 },
  { h: "21", today: 9400, last: 11300 },
];
export const TOP_DISHES = [{ id: "d10", qty: 46 }, { id: "d5", qty: 38 }, { id: "d6", qty: 35 }, { id: "d1", qty: 31 }, { id: "d11", qty: 124 }];
export const PAY_MIX = [{ m: "UPI", v: 48200 }, { m: "Card", v: 17400 }, { m: "Cash", v: 6300 }];

export const STAFF = ["Ravi", "Meera", "Arjun", "Sana"];

export const NOTIFICATIONS = [
  { id: "n1", text: "T4 asked for the bill", time: "1 min", tone: "coral" as const },
  { id: "n2", text: "T7 called a waiter", time: "2 min", tone: "coral" as const },
  { id: "n3", text: "Mutton Rogan Josh marked sold out", time: "18 min", tone: "warning" as const },
  { id: "n4", text: "New review: 5 stars from T9", time: "40 min", tone: "success" as const },
];
