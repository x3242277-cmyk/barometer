/* Interactive coalition sandbox. Its mandates are supplied by renderHome. */
(() => {
  "use strict";

  const chosen = new Set();
  let entries = [];
  let root = null;

  function seatMap() {
    const points = [];
    [16, 20, 24, 28, 32].forEach((count, row) => {
      const radius = 114 + row * 27;
      for (let i = 0; i < count; i++) {
        const angle = Math.PI * (0.04 + 0.92 * i / (count - 1));
        points.push({ angle, radius });
      }
    });
    points.sort((a, b) => a.angle - b.angle || a.radius - b.radius);
    const parties = entries.flatMap(entry => Array(entry.seats).fill(entry));
    return points.map((point, index) => {
      const party = parties[index];
      const x = 240 + Math.cos(point.angle) * point.radius;
      const y = 265 - Math.sin(point.angle) * point.radius;
      return `<circle class="ec-seat" data-ec-seat="${esc(party?.id || "")}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="6.2"><title>${party ? esc(party.name) : "מושב"}</title></circle>`;
    }).join("");
  }

  function card(entry) {
    const photo = S.leaders?.[entry.id] || LEADER_PLACEHOLDER;
    const leader = PARTY_LEADER[entry.id] || "";
    return `<button type="button" class="ec-party" data-ec-party="${esc(entry.id)}" aria-pressed="false" aria-label="${esc(entry.name)}, ${entry.seats} מנדטים">
      <span class="ec-party-image"><img src="${esc(photo)}"${leaderSrcset(photo, "(max-width: 560px) 95px, 140px")} alt="" loading="lazy" width="144" height="180"><span class="ec-check" aria-hidden="true">✓</span></span>
      <span class="ec-party-seats num">${entry.seats}</span>
      <span class="ec-party-name">${esc(entry.name)}</span>
      <span class="ec-party-leader">${esc(leader)}</span>
    </button>`;
  }

  function updateSelection() {
    if (!root) return;
    const selected = entries.filter(entry => chosen.has(entry.id));
    const total = selected.reduce((sum, entry) => sum + entry.seats, 0);
    const majority = total >= 61;
    root.classList.toggle("has-majority", majority);
    root.querySelectorAll("[data-ec-party]").forEach(button => {
      const active = chosen.has(button.dataset.ecParty);
      button.setAttribute("aria-pressed", String(active));
    });
    root.querySelectorAll("[data-ec-seat]").forEach(dot => {
      dot.classList.toggle("is-selected", chosen.has(dot.dataset.ecSeat));
    });
    root.querySelector(".ec-total").textContent = total;
    root.querySelector(".ec-map").setAttribute("aria-label", `120 מושבים בכנסת. ${total} מנדטים בקואליציה שבחרת. ${majority ? "הגעת לרוב" : `חסרים ${61 - total} לרוב`}.`);
    root.querySelector(".ec-meter-fill").style.width = `${Math.min(100, total / 120 * 100)}%`;
    root.querySelector(".ec-result").textContent = total === 0
      ? "הרכבת הממשלה מתחילה בבחירה שלך"
      : majority ? `יש רוב · ${total} מנדטים` : `עוד ${61 - total} מנדטים לרוב`;
    root.querySelector(".ec-selection").textContent = selected.length
      ? selected.map(entry => entry.name).join(" · ")
      : "לחצו על המפלגות שתרצו לצרף";
    root.querySelector(".ec-live").textContent = `${selected.length} מפלגות נבחרו. ${total} מנדטים. ${majority ? "הגעת לרוב של לפחות 61 מנדטים." : `חסרים ${61 - total} מנדטים לרוב.`}`;
    root.querySelector(".ec-reset").setAttribute("aria-disabled", String(selected.length === 0));
  }

  function handleClick(event) {
    const button = event.target.closest("[data-ec-party], .ec-reset");
    if (!button || !root.contains(button)) return;
    if (button.classList.contains("ec-reset")) chosen.clear();
    else {
      const id = button.dataset.ecParty;
      if (chosen.has(id)) chosen.delete(id);
      else chosen.add(id);
    }
    // Update the existing controls so keyboard focus survives each selection.
    updateSelection();
  }

  window.renderElectionTools = function renderElectionTools(seats) {
    const container = document.getElementById("election-coalition");
    if (!container) return;
    const priorFocus = container.contains(document.activeElement)
      ? document.activeElement.dataset.ecParty || (document.activeElement.classList.contains("ec-reset") ? "reset" : "")
      : "";
    const combined = new Map();
    Object.entries(seats || {}).forEach(([key, value]) => {
      const id = normId(key), count = Number(value);
      if (!Number.isInteger(count) || count <= 0) return;
      const previous = combined.get(id);
      combined.set(id, { id, name: partyMeta(key).name, seats: (previous?.seats || 0) + count });
    });
    entries = [...combined.values()].sort((a, b) => b.seats - a.seats || a.name.localeCompare(b.name, "he"));
    if (root !== container) {
      if (root) root.removeEventListener("click", handleClick);
      root = container;
      root.addEventListener("click", handleClick);
    }
    const historyLabel = S.homeHistory === "current" ? "התחזית המוצגת כעת" : `תחזית הארכיון · ${heDate(S.homeHistory)}`;
    const modeLabel = S.mode === "weighted" ? "משוקלל אמינות" : "תחזית הברומטר";
    root.setAttribute("aria-labelledby", "ec-title");
    root.innerHTML = `<div class="ec-panel">
      <header class="ec-heading">
        <div><p class="ec-eyebrow">הדרך ל־61</p><h2 id="ec-title">הקואליציה בידיים שלכם</h2><p class="ec-intro">בחרו מפלגות וראו אילו צירופים מגיעים לרוב בכנסת.</p></div>
        <span class="ec-source"><span aria-hidden="true"></span>${esc(historyLabel)}<small>${esc(modeLabel)}</small></span>
      </header>
      <div class="ec-content">
        <div class="ec-scoreboard">
          <svg class="ec-map" viewBox="0 0 480 290" role="img" aria-label="120 מושבים בכנסת">
            ${seatMap()}
            <text class="ec-total" x="240" y="220" text-anchor="middle">0</text>
            <text class="ec-total-label" x="240" y="246" text-anchor="middle">מנדטים מתוך 120</text>
          </svg>
          <p class="ec-result">הרכבת הממשלה מתחילה בבחירה שלך</p>
          <div class="ec-meter" aria-hidden="true"><span class="ec-meter-fill"></span><i></i></div>
          <div class="ec-meter-labels" aria-hidden="true"><span>0</span><strong>61 · רוב בכנסת</strong><span>120</span></div>
          <p class="ec-selection">לחצו על המפלגות שתרצו לצרף</p>
        </div>
        <div class="ec-choices">
          <div class="ec-choices-heading"><h3>המפלגות שלכם</h3><button class="ec-reset" type="button" aria-disabled="true"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6a7 7 0 1 1-1 6M4 2v4h4"/></svg>איפוס בחירה</button></div>
          <div class="ec-parties" role="group" aria-label="בחירת מפלגות לקואליציה">${entries.map(card).join("")}</div>
        </div>
      </div>
      <p class="ec-note"><span aria-hidden="true">i</span>תרגיל בהרכבת רוב על בסיס המנדטים בתחזית המוצגת. הבחירה חופשית ואינה תחזית להסכמות פוליטיות או להרכב הממשלה.</p>
      <p class="ec-live" role="status" aria-live="polite" aria-atomic="true"></p>
    </div>`;
    root.querySelectorAll(".ec-party img").forEach(img => {
      img.addEventListener("error", () => {
        img.removeAttribute("srcset");
        img.src = LEADER_PLACEHOLDER;
      }, { once: true });
    });
    updateSelection();
    if (priorFocus) {
      const target = priorFocus === "reset" ? root.querySelector(".ec-reset")
        : [...root.querySelectorAll("[data-ec-party]")].find(button => button.dataset.ecParty === priorFocus);
      if (target) target.focus({ preventScroll: true });
    }
  };
})();
