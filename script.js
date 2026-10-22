
function showSection(sectionId) {
  document.querySelectorAll("main section").forEach(function(section) {
    section.hidden = section.id !== sectionId;
  });
}

// Store the selected dataset
let linearData = null;

async function loadLinearData() {
  const dataset = document.getElementById("linearDataset").value;

  try {
    const response = await fetch("./" + dataset + ".json");

    if (!response.ok) {
      throw new Error("Could not load dataset");
    }

    linearData = await response.json();
    updateLinearPrediction();

  } catch (error) {
    document.getElementById("linearChart").textContent =
      "Error loading data: " + error.message;
  }
}

function updateLinearPrediction() {
  if (!linearData) return;

  const personId = document.getElementById("linearPerson").value;
  const person = linearData.people.find(p => p.id === personId);
  const result = linearData.linear.people[personId];

  const baseline = linearData.linear.baseline;
  const prediction = result.prediction;
  const pushes = result.grouped_pushes;
  const units = linearData.units;

  const chart = document.getElementById("linearChart");
  chart.innerHTML = "";

  const heading = document.createElement("h3");
  heading.textContent = person.label + " — " + person.description;
  chart.appendChild(heading);

  const start = document.createElement("p");
  start.textContent =
    "Starting prediction: " + baseline.toFixed(1) + " " + units;
  chart.appendChild(start);

  const featureNames = {
    hba1c: "HbA1c",
    age: "Age",
    bmi: "BMI",
    waist_cm: "Waist circumference",
    sex: "Sex",
    ethnicity: "Ethnicity"
  };

  Object.entries(pushes).forEach(([feature, value]) => {
    const row = document.createElement("div");
    row.style.marginBottom = "15px";

    const label = document.createElement("p");
    const direction = value >= 0 ? "↑" : "↓";
    const sign = value >= 0 ? "+" : "";

    label.textContent =
      (featureNames[feature] || feature) +
      ": " + direction + " " +
      sign + value.toFixed(1) + " " + units;

    const bar = document.createElement("div");
    bar.style.height = "18px";
    bar.style.borderRadius = "6px";
    bar.style.width =
      Math.max(2, Math.min(100, Math.abs(value) * 2)) + "%";
    bar.style.backgroundColor =
      value >= 0 ? "#16a34a" : "#dc2626";

    row.appendChild(label);
    row.appendChild(bar);
    chart.appendChild(row);
  });

  const finalPrediction = document.createElement("h3");
  finalPrediction.textContent =
    "Final prediction: " + prediction.toFixed(1) + " " + units;

  chart.appendChild(finalPrediction);

  const explanation = document.getElementById("linearExplanation");

  explanation.textContent =
    "The model begins at " + baseline.toFixed(1) + " " + units +
    ". Each feature contributes a positive or negative push. " +
    "Adding all the pushes produces the final prediction of " +
    prediction.toFixed(1) + " " + units +
    ". These contributions describe model associations, not causes.";
}

// Connect the dropdown menus
document.getElementById("linearDataset")
  .addEventListener("change", loadLinearData);

document.getElementById("linearPerson")
  .addEventListener("change", updateLinearPrediction);

// Start the website
showSection("linear");
loadLinearData();
