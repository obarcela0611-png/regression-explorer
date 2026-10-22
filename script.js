
"use strict";

// Regression Explorer
// Uses the professor's supplied model outputs.

const datasets = {};
const charts = {};

function byId(id) {
  return document.getElementById(id);
}

function format(number, digits = 1) {
  return Number(number).toFixed(digits);
}

function signed(number, digits = 1) {
  return (number >= 0 ? "+" : "") + format(number, digits);
}

function valueWithUnits(value, units) {
  return format(value) + " " + units;
}

function showSection(sectionId) {
  document.querySelectorAll("main section").forEach(section => {
    section.hidden = section.id !== sectionId;
  });

  document.querySelectorAll("nav button").forEach(button => {
    const active = button.getAttribute("onclick")
      ?.includes("'" + sectionId + "'");
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  Object.values(charts).forEach(chart => chart.resize());
}

async function getData(name) {
  if (!datasets[name]) {
    const response = await fetch("./" + name + ".json");

    if (!response.ok) {
      throw new Error("Unable to load " + name + ".json");
    }

    datasets[name] = await response.json();
  }

  return datasets[name];
}

function getPerson(data, id) {
  return data.people.find(person => person.id === id);
}

function featureLabel(data, key) {
  const feature = data.features.find(f => f.name === key);
  return feature ? feature.label : key.replaceAll("_", " ");
}

function personDetails(data, person) {
  return "<strong>" + person.label + "</strong> — " +
    person.description +
    "<p>Observed value: " +
    valueWithUnits(person.observed, data.units) +
    ". This is the actual measured outcome, not the prediction.</p>";
}

function showError(elementId, error) {
  byId(elementId).textContent = "Error: " + error.message;
}

// ----------------------------------
// 1. PUSH & PULL
// ----------------------------------

let linearData;
let linearValues = {};

async function loadLinear() {
  try {
    linearData = await getData(byId("linearDataset").value);
    resetLinear();
  } catch (error) {
    showError("linearExplanation", error);
  }
}

function resetLinear() {
  if (!linearData) return;

  const person = getPerson(linearData, byId("linearPerson").value);
  linearValues = { ...person.values };

  buildLinearEditors();
  updateLinear();
}

function buildLinearEditors() {
  const container = byId("linearEditors");
  container.innerHTML = "";

  linearData.features.forEach(feature => {
    const label = document.createElement("label");
    label.textContent = feature.label;

    if (feature.binary) {
      const select = document.createElement("select");

      [0, 1].forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value === 1 ? "Yes (1)" : "No (0)";
        select.appendChild(option);
      });

      select.value = linearValues[feature.name];

      select.addEventListener("change", () => {
        linearValues[feature.name] = Number(select.value);
        updateLinear();
      });

      label.appendChild(select);
    } else {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.value = linearValues[feature.name];

      const stats = linearData.feature_stats?.[feature.name];

      if (stats) {
        input.min = stats.min;
        input.max = stats.max;
      }

      input.addEventListener("change", () => {
        const value = Number(input.value);

        if (!Number.isFinite(value) ||
            (stats && (value < stats.min || value > stats.max))) {
          input.value = linearValues[feature.name];
          return;
        }

        linearValues[feature.name] = value;
        updateLinear();
      });

      label.appendChild(input);
    }

    container.appendChild(label);
  });

  // Use one menu per categorical group where available.
  (linearData.categorical_groups || []).forEach(group => {
    const columns = group.levels
      .map(level => level.column)
      .filter(Boolean);

    // Replace separate binary controls with one categorical menu.
    container.querySelectorAll("label").forEach(label => {
      const field = label.querySelector("select, input");
      if (field && columns.some(column =>
        label.textContent === featureLabel(linearData, column)
      )) {
        label.remove();
      }
    });

    const label = document.createElement("label");
    label.textContent = group.label || group.name;

    const select = document.createElement("select");

    group.levels.forEach((level, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = level.label;
      select.appendChild(option);
    });

    const selected = group.levels.findIndex(level => {
      if (!level.column) {
        return columns.every(column => Number(linearValues[column]) === 0);
      }
      return Number(linearValues[level.column]) === 1;
    });

    select.value = Math.max(0, selected);

    select.addEventListener("change", () => {
      columns.forEach(column => linearValues[column] = 0);
      const level = group.levels[Number(select.value)];
      if (level.column) linearValues[level.column] = 1;
      updateLinear();
    });

    label.appendChild(select);
    container.appendChild(label);
  });
}

function updateLinear() {
  if (!linearData) return;

  const data = linearData;
  const person = getPerson(data, byId("linearPerson").value);
  const model = data.linear;
  const baseline = model.baseline;
  const coefficients = model.coefficients;
  const reference = model.reference;

  let prediction = baseline;
  const pushes = [];

  data.features.forEach(feature => {
    const key = feature.name;
    const coefficient = coefficients[key] || 0;
    const ref = reference[key] || 0;
    const value = linearValues[key];

    const push = coefficient * (value - ref);
    prediction += push;

    pushes.push({
      key,
      label: featureLabel(data, key),
      value,
      reference: ref,
      coefficient,
      push
    });
  });

  byId("linearPersonDetails").innerHTML = personDetails(data, person);
  byId("linearBaseline").textContent = valueWithUnits(baseline, data.units);
  byId("linearPrediction").textContent =
    valueWithUnits(prediction, data.units);

  const container = byId("linearChart");
  container.innerHTML = "";

  const maxPush = Math.max(
    1,
    ...pushes.map(item => Math.abs(item.push))
  );

  pushes.forEach(item => {
    const row = document.createElement("div");
    row.className = "push-row";

    const heading = document.createElement("div");
    heading.className = "push-label";

    const name = document.createElement("span");
    name.textContent = item.label;

    const amount = document.createElement("strong");
    amount.className = item.push >= 0 ? "positive" : "negative";
    amount.textContent =
      signed(item.push) + " " + data.units;

    heading.append(name, amount);

    const track = document.createElement("div");
    track.className = "push-track";

    const bar = document.createElement("div");
    bar.className = "push-bar " +
      (item.push >= 0 ? "push-positive" : "push-negative");

    bar.style.width =
      (Math.abs(item.push) / maxPush * 100) + "%";

    track.appendChild(bar);
    row.append(heading, track);
    container.appendChild(row);
  });

  byId("linearEquation").textContent =
    "Starting prediction (" + format(baseline) + ") + " +
    "feature contributions (" +
    pushes.map(item => signed(item.push)).join(" ") +
    ") = " + format(prediction) + " " + data.units +
    ". Calculations use unrounded values.";

  const coefficientContainer = byId("linearCoefficient");
  coefficientContainer.innerHTML = "";

  pushes.forEach(item => {
    const paragraph = document.createElement("p");

    paragraph.textContent =
      item.label + ": coefficient " +
      signed(item.coefficient, 4) +
      " " + data.units + " per feature unit. " +
      "Current value " + format(item.value, 2) +
      ", reference " + format(item.reference, 2) +
      ", individual push " +
      signed(item.push, 2) + " " + data.units + ".";

    coefficientContainer.appendChild(paragraph);
  });

  const groupInfo = (data.categorical_groups || [])
    .map(group => group.name + " reference category: " + group.reference)
    .join(". ");

  byId("linearExplanation").textContent =
    "A coefficient describes the model's expected prediction change " +
    "for a one-unit feature increase while other features remain fixed. " +
    "A push is the contribution for this particular person's value " +
    "relative to the model's reference values. " +
    "These are not the same as global feature importance. " +
    (groupInfo ? groupInfo + ". " : "") +
    "The baseline uses training-set averages, including averages of " +
    "categorical indicator columns; it is not necessarily a real person. " +
    "These are associations learned by the model, not causal effects.";
}

// ----------------------------------
// 2. WISDOM OF THE FOREST
// ----------------------------------

let forestData;

async function loadForest() {
  try {
    forestData = await getData(byId("forestDataset").value);
    updateForest();
  } catch (error) {
    showError("forestExplanation", error);
  }
}

function createChart(id, type, labels, datasetsList, options = {}) {
  if (charts[id]) charts[id].destroy();

  charts[id] = new Chart(byId(id), {
    type,
    data: { labels, datasets: datasetsList },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: datasetsList.length > 1 }
      },
      scales: {
        y: { title: { display: true, text: options.units || "" } },
        x: { title: { display: true, text: options.xLabel || "" } }
      }
    }
  });
}

function updateForest() {
  if (!forestData) return;

  const data = forestData;
  const personId = byId("forestPerson").value;
  const person = getPerson(data, personId);
  const result = data.forest.people[personId];
  const trees = result.tree_predictions;

  const count = Math.min(
    trees.length,
    Number(byId("forestCount").value)
  );

  const selected = trees.slice(0, count);

  const average =
    selected.reduce((sum, value) => sum + value, 0) / count;

  const running = [];
  let total = 0;

  trees.forEach((value, index) => {
    total += value;
    running.push(total / (index + 1));
  });

  byId("forestPersonDetails").innerHTML = personDetails(data, person);
  byId("forestCountLabel").textContent = count;
  byId("forestTreeOne").textContent = valueWithUnits(trees[0], data.units);
  byId("forestFullPrediction").textContent =
    valueWithUnits(result.prediction, data.units);
  byId("forestRunningAverage").textContent =
    valueWithUnits(average, data.units);

  byId("forestStatus").textContent =
    count === trees.length
      ? "Complete forest: averaging all " + trees.length + " trees."
      : "Partial forest: averaging the first " + count +
        " of " + trees.length + " trees.";

  createChart(
    "forestRunningChart",
    "line",
    trees.map((_, index) => index + 1),
    [{
      label: "Running forest average",
      data: running,
      borderColor: "#2366ad",
      backgroundColor: "#2366ad",
      pointRadius: 0,
      borderWidth: 2
    }],
    { units: data.units, xLabel: "Number of trees" }
  );

  createChart(
    "forestTreesChart",
    "bar",
    selected.map((_, index) => index + 1),
    [{
      label: "Individual tree predictions",
      data: selected,
      backgroundColor: "#6e9cd5"
    }],
    { units: data.units, xLabel: "Tree number" }
  );

  const min = Math.min(...trees);
  const max = Math.max(...trees);

  byId("forestExplanation").textContent =
    "The 100 trees do not always agree. For this person, " +
    "their predictions range from " +
    format(min) + " to " + format(max) + " " + data.units +
    ". Each tree uses a bootstrap sample of training rows, " +
    "and only a subset of features is considered at each split. " +
    "The forest prediction is the mean of the tree predictions. " +
    "The spread between trees illustrates model disagreement, " +
    "not a statistical confidence interval. " +
    "The partial-forest slider averages a fixed subset of " +
    "the supplied trees; it does not retrain the model.";
}

// ----------------------------------
// 3. ONE CORRECTION AT A TIME
// ----------------------------------

let boostingData;

async function loadBoosting() {
  try {
    boostingData = await getData(byId("boostingDataset").value);

    const model = boostingData.boosting;
    const maxRound = model.rmse.validation.length - 1;

    byId("boostingRound").max = maxRound;
    byId("boostingStop").max = maxRound;
    byId("boostingRound").value = 0;
    byId("boostingStop").value = model.best_validation_round;

    updateBoosting();
  } catch (error) {
    showError("boostingExplanation", error);
  }
}

function updateBoosting() {
  if (!boostingData) return;

  const data = boostingData;
  const model = data.boosting;
  const personId = byId("boostingPerson").value;
  const person = getPerson(data, personId);
  const result = model.people[personId];

  const staged = result.staged;
  const round = Math.min(
    Number(byId("boostingRound").value),
    staged.length - 1
  );

  const previous = round === 0 ? staged[0] : staged[round - 1];
  const current = staged[round];
  const correction = round === 0 ? 0 : current - previous;

  const stop = Number(byId("boostingStop").value);
  const best = model.best_validation_round;

  byId("boostingPersonDetails").innerHTML = personDetails(data, person);
  byId("boostingRoundLabel").textContent = round;
  byId("boostingBaseline").textContent =
    valueWithUnits(model.init, data.units);
  byId("boostingFinal").textContent =
    valueWithUnits(staged[staged.length - 1], data.units);

  byId("boostingPreviousValue").textContent =
    valueWithUnits(previous, data.units);

  byId("boostingCorrection").textContent =
    signed(correction, 2) + " " + data.units;

  byId("boostingCurrentValue").textContent =
    valueWithUnits(current, data.units);

  byId("boostingPrevious").disabled = round === 0;
  byId("boostingNext").disabled = round === staged.length - 1;

  const train = model.rmse.train;
  const validation = model.rmse.validation;

  createChart(
    "boostingErrorChart",
    "line",
    train.map((_, index) => index),
    [
      {
        label: "Training RMSE",
        data: train,
        borderColor: "#2366ad",
        backgroundColor: "#2366ad",
        pointRadius: 0,
        borderWidth: 2
      },
      {
        label: "Validation RMSE",
        data: validation,
        borderColor: "#e47b42",
        backgroundColor: "#e47b42",
        pointRadius: 0,
        borderWidth: 2
      }
    ],
    { units: data.units, xLabel: "Boosting round" }
  );

  byId("boostingStopLabel").textContent = stop;

  byId("boostingComparison").textContent =
    "Your stopping round: " + stop +
    " (validation RMSE " + format(validation[stop], 2) +
    " " + data.units + "). " +
    "Best validation round: " + best +
    " (validation RMSE " +
    format(model.best_validation_rmse, 2) +
    " " + data.units + "). " +
    "The best round has the lowest validation RMSE " +
    "among the supplied rounds.";

  byId("boostingExplanation").textContent =
    "At round 0, the model predicts the training-set mean. " +
    "At each later round, a new tree learns to correct remaining " +
    "training residuals, which are observed values minus predictions. " +
    "The updated prediction equals the previous prediction plus " +
    "the new correction. The supplied staged predictions already " +
    "include the learning rate, so corrections are not multiplied " +
    "by it again. Training error can keep decreasing while " +
    "validation error rises, which indicates overfitting. " +
    "Choosing the round with the lowest validation RMSE helps " +
    "select a model that generalizes better.";
}

// ----------------------------------
// EVENTS AND INITIALIZATION
// ----------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  byId("linearDataset").addEventListener("change", loadLinear);
  byId("linearPerson").addEventListener("change", resetLinear);
  byId("linearReset").addEventListener("click", resetLinear);

  byId("forestDataset").addEventListener("change", loadForest);
  byId("forestPerson").addEventListener("change", updateForest);
  byId("forestCount").addEventListener("input", updateForest);

  byId("boostingDataset").addEventListener("change", loadBoosting);

  byId("boostingPerson").addEventListener("change", () => {
    byId("boostingRound").value = 0;
    updateBoosting();
  });

  byId("boostingRound").addEventListener("input", updateBoosting);
  byId("boostingStop").addEventListener("input", updateBoosting);

  byId("boostingPrevious").addEventListener("click", () => {
    byId("boostingRound").stepDown();
    updateBoosting();
  });

  byId("boostingNext").addEventListener("click", () => {
    byId("boostingRound").stepUp();
    updateBoosting();
  });

  showSection("linear");

  await Promise.all([
    loadLinear(),
    loadForest(),
    loadBoosting()
  ]);
});
