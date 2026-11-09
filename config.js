/* =========================================================
   Dinedot — setup for one restaurant (the only file that changes per restaurant,
   apart from the restaurant's own settings, menu and tables, which live in the database).
   ========================================================= */
const SITE = {
  product: "Dinedot",                 // product name shown on the staff app sign-in

  // Database (Supabase, Mumbai). Both values are public by design.
  // Never put the secret / service_role key or the database password here.
  // Leave both empty to run the built-in demo (sample restaurant, saved only in this browser).
  supabaseUrl: "",
  supabaseKey: "",

  // The address guests' QR codes open (this site's t.html). Used when printing QR codes.
  // Empty = the address the staff app is opened from.
  guestUrl: ""
};
