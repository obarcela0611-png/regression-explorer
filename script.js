
function showSection(sectionId) {
  // Hide all three sections
  document.querySelectorAll("main section").forEach(function(section) {
    section.hidden = true;
  });

  // Show the selected section
  document.getElementById(sectionId).hidden = false;
}

// Start with the Linear Regression section
showSection("linear");
