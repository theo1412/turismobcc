const DEFAULTS = { enabled: true, bccAddress: "" };
const $ = (id) => document.getElementById(id);
const enabled = $("enabled");
const bcc = $("bcc");
const status = $("status");

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((s || "").trim());
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  enabled.checked = s.enabled;
  bcc.value = s.bccAddress || "";
});

function save() {
  const val = bcc.value.trim();
  if (val && !isEmail(val)) {
    status.textContent = "Adresse e-mail invalide";
    status.className = "status err";
    return;
  }
  chrome.storage.sync.set({ enabled: enabled.checked, bccAddress: val }, () => {
    if (!enabled.checked) status.textContent = "Désactivé";
    else if (!val) status.textContent = "Ajoutez une adresse pour activer";
    else status.textContent = "Enregistré ✓";
    status.className = "status";
  });
}

enabled.addEventListener("change", save);
bcc.addEventListener("input", save);
