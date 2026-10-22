
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
        option.value = value
