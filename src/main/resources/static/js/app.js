(() => {
  const $ = (selector) => document.querySelector(selector);
  const authView = $("#auth-view");
  const appView = $("#app-view");
  const authForm = $("#auth-form");
  const authMessage = $("#auth-message");
  const toast = $("#toast");
  const runDialog = $("#run-dialog");
  const detailDialog = $("#detail-dialog");
  const pageSize = 8;
  let token = localStorage.getItem("runlog.token");
  let username = localStorage.getItem("runlog.username") || "Runner";
  let authMode = "login";
  let currentPage = 0;
  let totalPages = 0;
  let toastTimer;

  const api = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let response;
    try {
      response = await fetch(path, { ...options, headers });
    } catch (_) {
      throw new Error("Couldn’t reach Runlog. Check that the application is running and try again.");
    }
    if (response.status === 401 && token) {
      clearSession();
      showAuth("Your session has ended. Please sign in again.");
      throw new Error("Your session has ended. Please sign in again.");
    }
    if (!response.ok) {
      let message = "Something went wrong. Please try again.";
      const body = await response.text();
      if (body) {
        try {
          const parsed = JSON.parse(body);
          message = parsed.message || parsed.error || parsed.detail || (typeof parsed === "string" ? parsed : message);
        } catch (_) {
          message = body.replace(/^\s*\[?\w+\]?\s*/, "").slice(0, 220) || message;
        }
      }
      throw new Error(message);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const formatDate = (value, options = { month: "short", day: "numeric", year: "numeric" }) => {
    if (!value) return "—";
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, options).format(date);
  };
  const niceNumber = (value, digits = 2) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });

  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function clearSession() {
    token = null;
    username = "Runner";
    localStorage.removeItem("runlog.token");
    localStorage.removeItem("runlog.username");
  }

  function showAuth(message = "") {
    appView.classList.add("is-hidden");
    authView.classList.remove("is-hidden");
    authMessage.textContent = message;
    authMessage.classList.toggle("success", false);
    if (message) setMode("login");
  }

  function setMode(mode) {
    authMode = mode;
    const isRegister = mode === "register";
    document.querySelectorAll(".auth-tab").forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    $("#email-wrap").classList.toggle("is-hidden", !isRegister);
    $("#email").required = isRegister;
    $("#password").minLength = isRegister ? 8 : 1;
    $("#password").setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
    $("#auth-kicker").textContent = isRegister ? "A FRESH START" : "WELCOME BACK";
    $("#auth-title").textContent = isRegister ? "Your miles start here." : "Good to see you.";
    $("#auth-subtitle").textContent = isRegister ? "Create your account and make room for the next run." : "Sign in and pick up where you left off.";
    $("#auth-submit span:first-child").textContent = isRegister ? "Create account" : "Sign in";
    $("#password").placeholder = isRegister ? "At least 8 characters" : "Your password";
    authMessage.textContent = "";
    authMessage.classList.remove("success");
  }

  function animateWelcome() {
    const overlay = $("#welcome-overlay");
    overlay.classList.remove("is-hidden", "leaving");
    overlay.setAttribute("aria-hidden", "false");
    return new Promise((resolve) => setTimeout(() => {
      overlay.classList.add("leaving");
      setTimeout(() => {
        overlay.classList.add("is-hidden");
        overlay.classList.remove("leaving");
        overlay.setAttribute("aria-hidden", "true");
        resolve();
      }, 250);
    }, 1120));
  }

  async function enterApplication(name, animate = false) {
    username = name || "Runner";
    localStorage.setItem("runlog.username", username);
    $("#profile-name").textContent = username;
    $("#avatar").textContent = username.trim().charAt(0).toUpperCase() || "R";
    authView.classList.add("is-hidden");
    appView.classList.remove("is-hidden");
    if (animate) {
      appView.classList.add("is-hidden");
      await animateWelcome();
      appView.classList.remove("is-hidden");
    }
    await loadDashboard();
  }

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#auth-submit");
    button.disabled = true;
    authMessage.textContent = "";
    const formData = new FormData(authForm);
    const credentials = { username: formData.get("username").trim(), password: formData.get("password") };
    try {
      if (authMode === "register") {
        await api("/users", {
          method: "POST",
          body: JSON.stringify({ ...credentials, email: formData.get("email").trim() })
        });
        authMessage.textContent = "Account created. Signing you in…";
        authMessage.classList.add("success");
      }
      try {
        const result = await api("/auth/login", { method: "POST", body: JSON.stringify(credentials) });
        token = result.token;
        localStorage.setItem("runlog.token", token);
        await enterApplication(credentials.username, true);
      } catch (error) {
        if (authMode === "register") {
          authMessage.textContent = `Account created, but automatic sign-in failed. Use the Sign in tab with username ${credentials.username}.`;
          authMessage.classList.add("success");
        } else {
          throw error;
        }
      }
    } catch (error) {
      authMessage.textContent = error.message || "Please check your details and try again.";
      authMessage.classList.remove("success");
    } finally {
      button.disabled = false;
    }
  });

  document.querySelectorAll(".auth-tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  $(".password-toggle").addEventListener("click", (event) => {
    const input = $("#password");
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    event.currentTarget.textContent = isHidden ? "Hide" : "Show";
    event.currentTarget.setAttribute("aria-label", `${isHidden ? "Hide" : "Show"} password`);
  });

  async function loadDashboard() {
    $("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(new Date());
    await Promise.allSettled([loadStats(), loadLongestRun(), loadRuns()]);
  }

  async function loadStats() {
    try {
      const stats = await api("/runs/stats");
      $("#total-distance").textContent = niceNumber(stats.totalDistance);
      $("#total-runs").textContent = niceNumber(stats.totalRuns, 0);
      $("#average-distance").textContent = niceNumber(stats.averageDistance);
      $("#average-pace").textContent = niceNumber(stats.averagePace);
      $("#run-count-label").textContent = niceNumber(stats.totalRuns, 0);
    } catch (error) {
      if (token) showToast(error.message, true);
    }
  }

  async function loadLongestRun() {
    try {
      const run = await api("/runs/longest");
      $("#longest-distance").textContent = niceNumber(run.distance);
      $("#longest-date").textContent = `Logged ${formatDate(run.date)}`;
    } catch (error) {
      if (error.message.includes("session has ended")) return;
      $("#longest-distance").textContent = "—";
      $("#longest-date").textContent = "Your furthest yet";
    }
  }

  function runRow(run, index) {
    const date = new Date(`${run.date}T12:00:00`);
    const weekday = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
    return `<article class="run-row" style="animation-delay:${Math.min(index * 35, 210)}ms">
      <div class="run-date-wrap"><span class="run-date-icon">↗</span><div><div class="run-date">${escapeHtml(formatDate(run.date))}</div><div class="run-weekday">${escapeHtml(weekday)}</div></div></div>
      <div class="row-metric"><strong>${niceNumber(run.distance)} km</strong><span>DISTANCE</span></div>
      <div class="row-metric"><strong>${escapeHtml(String(run.duration))} min</strong><span>DURATION</span></div>
      <div class="row-metric pace-metric"><strong>${niceNumber(run.pace)}</strong><span>MIN / KM</span></div>
      <div class="run-note" title="${escapeHtml(run.notes || "")}">${escapeHtml(run.notes || "No note for this run")}</div>
      <div class="run-actions"><button class="row-action" type="button" data-action="view" data-id="${escapeHtml(run.id)}" title="View details" aria-label="View run details">↗</button><button class="row-action" type="button" data-action="edit" data-id="${escapeHtml(run.id)}" title="Edit run" aria-label="Edit run">✎</button><button class="row-action delete" type="button" data-action="delete" data-id="${escapeHtml(run.id)}" title="Delete run" aria-label="Delete run">×</button></div>
    </article>`;
  }

  async function loadRuns() {
    const list = $("#runs-list");
    list.innerHTML = '<div class="loading-row"><span class="spinner"></span> Loading your runs</div>';
    const params = new URLSearchParams({ page: String(currentPage), size: String(pageSize) });
    if ($("#filter-from").value) params.set("from", $("#filter-from").value);
    if ($("#filter-to").value) params.set("to", $("#filter-to").value);
    try {
      const page = await api(`/runs?${params.toString()}`);
      const runs = page.content || [];
      totalPages = Number(page.totalPages || 0);
      $("#page-label").textContent = totalPages ? `Page ${currentPage + 1} of ${totalPages}` : "Page 1";
      $("#prev-page").disabled = currentPage <= 0;
      $("#next-page").disabled = totalPages === 0 || currentPage >= totalPages - 1;
      if (!runs.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">↗</div><strong>${currentPage || $("#filter-from").value || $("#filter-to").value ? "No runs found" : "Your story starts with a step."}</strong><p>${currentPage || $("#filter-from").value || $("#filter-to").value ? "Try another date range, or log a new run." : "Log your first run and let the miles add up."}</p><button class="button button-lime" type="button" data-empty-new>＋ Log a run</button></div>`;
      } else {
        list.innerHTML = runs.map(runRow).join("");
      }
    } catch (error) {
      list.innerHTML = `<div class="empty-state"><strong>We couldn’t load your runs.</strong><p>${escapeHtml(error.message)}</p><button class="button button-outline" type="button" data-retry>Try again</button></div>`;
    }
  }

  function openNewRun() {
    $("#run-form").reset();
    $("#run-id").value = "";
    $("#run-date").value = new Date().toISOString().slice(0, 10);
    $("#run-dialog-title").textContent = "Log a run";
    $("#save-run").innerHTML = 'Save run <span class="button-arrow">↗</span>';
    $("#run-message").textContent = "";
    runDialog.showModal();
  }

  async function editRun(id) {
    try {
      const run = await api(`/runs/${encodeURIComponent(id)}`);
      $("#run-form").reset();
      $("#run-id").value = run.id;
      $("#run-date").value = run.date;
      $("#run-distance").value = run.distance;
      $("#run-duration").value = run.duration;
      $("#run-notes").value = run.notes || "";
      $("#run-dialog-title").textContent = "Edit your run";
      $("#save-run").innerHTML = 'Save changes <span class="button-arrow">↗</span>';
      $("#run-message").textContent = "";
      runDialog.showModal();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function viewRun(id) {
    try {
      const run = await api(`/runs/${encodeURIComponent(id)}`);
      $("#run-detail").innerHTML = `<div class="detail-cell"><span>Date</span><strong>${escapeHtml(formatDate(run.date))}</strong></div><div class="detail-cell"><span>Distance</span><strong>${niceNumber(run.distance)} km</strong></div><div class="detail-cell"><span>Duration</span><strong>${escapeHtml(String(run.duration))} minutes</strong></div><div class="detail-cell"><span>Average pace</span><strong>${niceNumber(run.pace)} min/km</strong></div>${run.notes ? `<p class="detail-note">${escapeHtml(run.notes)}</p>` : '<p class="detail-note">No note was added for this run.</p>'}`;
      detailDialog.showModal();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  async function deleteRun(id) {
    if (!window.confirm("Delete this run from your log? This can’t be undone.")) return;
    try {
      await api(`/runs/${encodeURIComponent(id)}`, { method: "DELETE" });
      showToast("Run removed from your log.");
      await loadDashboard();
    } catch (error) {
      showToast(error.message, true);
    }
  }

  $("#run-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#save-run");
    button.disabled = true;
    const id = $("#run-id").value;
    const payload = {
      date: $("#run-date").value,
      distance: Number($("#run-distance").value),
      duration: Number($("#run-duration").value),
      notes: $("#run-notes").value.trim()
    };
    try {
      await api(id ? `/runs/${encodeURIComponent(id)}` : "/runs", { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
      runDialog.close();
      showToast(id ? "Run updated. Nice work." : "Run logged. Nice work.");
      currentPage = 0;
      await loadDashboard();
    } catch (error) {
      $("#run-message").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $(`#${button.dataset.close}`).close()));
  [runDialog, detailDialog].forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));
  $("#new-run-button").addEventListener("click", openNewRun);
  $("#runs-list").addEventListener("click", (event) => {
    if (event.target.closest("[data-empty-new]")) return openNewRun();
    if (event.target.closest("[data-retry]")) return loadRuns();
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "view") viewRun(id);
    if (action === "edit") editRun(id);
    if (action === "delete") deleteRun(id);
  });
  $("#apply-filter").addEventListener("click", () => { currentPage = 0; loadRuns(); });
  $("#clear-filter").addEventListener("click", () => { $("#filter-from").value = ""; $("#filter-to").value = ""; currentPage = 0; loadRuns(); });
  $("#prev-page").addEventListener("click", () => { if (currentPage > 0) { currentPage -= 1; loadRuns(); } });
  $("#next-page").addEventListener("click", () => { if (currentPage + 1 < totalPages) { currentPage += 1; loadRuns(); } });
  $("#refresh-button").addEventListener("click", loadDashboard);

  function logout() {
    clearSession();
    authForm.reset();
    setMode("login");
    showAuth();
  }
  $("#logout-button").addEventListener("click", logout);
  $("#mobile-logout").addEventListener("click", logout);

  if (token) enterApplication(username).catch(() => showAuth());
  else setMode("login");
})();
