const loginPanel = document.querySelector("#login-panel");
const dashboard = document.querySelector("#admin-dashboard");
const loginForm = document.querySelector("#login-form");
const caseForm = document.querySelector("#case-form");
const caseList = document.querySelector("#case-list");
const stats = document.querySelector("#stats");
const objectivesContainer = document.querySelector("#objectives");
const evidenceContainer = document.querySelector("#evidence");
const objectiveTemplate = document.querySelector("#objective-template");
const evidenceTemplate = document.querySelector("#evidence-template");
const result = document.querySelector("#case-result");

let artifacts = [];
let editingCaseId = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.detail || "Admin request failed.");
  }

  return payload;
}

function addObjective(data = {}) {
  const fragment = objectiveTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".objective-card");

  for (const input of card.querySelectorAll("[data-field]")) {
    input.value = data[input.dataset.field] || "";
  }

  card.querySelector(".remove-card").addEventListener("click", () => card.remove());
  objectivesContainer.appendChild(fragment);
}

function addEvidence(data = {}) {
  const fragment = evidenceTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".evidence-card");
  const select = card.querySelector("select");

  for (const artifact of artifacts) {
    const option = document.createElement("option");
    option.value = artifact.id;
    option.textContent = `${artifact.id} // ${artifact.filename}`;
    select.appendChild(option);
  }

  for (const input of card.querySelectorAll("[data-field]")) {
    input.value = data[input.dataset.field] || "";
  }

  card.querySelector(".remove-card").addEventListener("click", () => card.remove());
  evidenceContainer.appendChild(fragment);
}

function collectCards(container, selector) {
  return [...container.querySelectorAll(selector)].map((card) => {
    const value = {};
    for (const input of card.querySelectorAll("[data-field]")) {
      value[input.dataset.field] = input.value.trim();
    }
    return value;
  });
}

function resetForm() {
  editingCaseId = null;
  caseForm.reset();
  caseForm.elements.difficulty.value = 3;
  caseForm.elements.requires_solved_nodes.value = 0;
  document.querySelector("#form-title").textContent = "Create Case";
  objectivesContainer.replaceChildren();
  evidenceContainer.replaceChildren();
  addObjective();
  result.textContent = "";
}

function caseToEditable(item) {
  return {
    ...item,
    reward_message: item.reward?.message || "",
    objectives: item.objectives.map((objective) => ({
      id: objective.id,
      prompt: objective.prompt,
      answer: "",
    })),
  };
}

function editCase(item) {
  const editable = caseToEditable(item);
  editingCaseId = item.id;
  document.querySelector("#form-title").textContent = `Edit ${item.id}`;

  for (const [name, value] of Object.entries(editable)) {
    const input = caseForm.elements[name];
    if (input && !["objectives", "evidence"].includes(name)) {
      input.value = value ?? "";
    }
  }

  objectivesContainer.replaceChildren();
  evidenceContainer.replaceChildren();

  editable.objectives.forEach(addObjective);
  editable.evidence.forEach(addEvidence);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteCase(caseId) {
  if (!confirm(`Delete ${caseId}? This cannot be undone.`)) return;
  await api(`/api/admin/cases/${encodeURIComponent(caseId)}`, {
    method: "DELETE",
  });
  await loadDashboard();
}

function renderCases(cases) {
  caseList.replaceChildren();

  for (const item of cases) {
    const article = document.createElement("article");
    article.className = "case-entry";
    article.innerHTML = `
      <span class="eyebrow">CASE-${String(item.sequence).padStart(3, "0")}</span>
      <h3>${item.title}</h3>
      <p>${item.category} // difficulty ${item.difficulty}<br>
      ${item.objectives.length} objectives // ${item.evidence.length} evidence items</p>
      <div class="case-actions">
        <button type="button" data-edit>EDIT</button>
        <button type="button" data-delete>DELETE</button>
      </div>
    `;

    article.querySelector("[data-edit]").addEventListener("click", () => editCase(item));
    article.querySelector("[data-delete]").addEventListener("click", () => deleteCase(item.id));
    caseList.appendChild(article);
  }
}

async function loadDashboard() {
  const [overview, cases, artifactList] = await Promise.all([
    api("/api/admin/overview"),
    api("/api/admin/cases"),
    api("/api/admin/artifacts"),
  ]);

  artifacts = artifactList;
  stats.innerHTML = Object.entries({
    PLAYERS: overview.players,
    NODE_SOLVES: overview.node_solves,
    COMPLETED_CASES: overview.completed_cases,
    CASES: overview.cases,
    ARTIFACTS: overview.artifacts,
  }).map(([label, value]) => `
    <article class="admin-stat">
      <span>${label.replaceAll("_", " ")}</span>
      <strong>${value}</strong>
    </article>
  `).join("");

  renderCases(cases);

  if (!objectivesContainer.children.length) {
    addObjective();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const loginResult = document.querySelector("#login-result");

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        key: document.querySelector("#admin-key").value,
      }),
    });

    loginPanel.classList.add("hidden");
    dashboard.classList.remove("hidden");
    await loadDashboard();
  } catch (error) {
    loginResult.textContent = error.message;
    loginResult.className = "result wrong";
  }
});

caseForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    id: caseForm.elements.id.value.trim(),
    sequence: Number(caseForm.elements.sequence.value),
    slug: caseForm.elements.slug.value.trim(),
    title: caseForm.elements.title.value.trim(),
    difficulty: Number(caseForm.elements.difficulty.value),
    category: caseForm.elements.category.value.trim(),
    status: "active",
    requires_solved_nodes: Number(caseForm.elements.requires_solved_nodes.value || 0),
    briefing: caseForm.elements.briefing.value.trim(),
    reward_message: caseForm.elements.reward_message.value.trim(),
    objectives: collectCards(objectivesContainer, ".objective-card"),
    evidence: collectCards(evidenceContainer, ".evidence-card"),
  };

  if (!payload.objectives.length) {
    result.textContent = "At least one objective is required.";
    result.className = "result wrong";
    return;
  }

  try {
    const path = editingCaseId
      ? `/api/admin/cases/${encodeURIComponent(editingCaseId)}`
      : "/api/admin/cases";

    await api(path, {
      method: editingCaseId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });

    result.textContent = editingCaseId ? "Case updated." : "Case published.";
    result.className = "result correct";
    resetForm();
    await loadDashboard();
  } catch (error) {
    result.textContent = error.message;
    result.className = "result wrong";
  }
});

document.querySelector("#add-objective").addEventListener("click", () => addObjective());
document.querySelector("#add-evidence").addEventListener("click", () => addEvidence());
document.querySelector("#reset-form").addEventListener("click", resetForm);

(async () => {
  try {
    await loadDashboard();
    loginPanel.classList.add("hidden");
    dashboard.classList.remove("hidden");
  } catch {
    resetForm();
  }
})();
