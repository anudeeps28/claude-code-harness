const ap = require('../artifact-parsers');
const { read } = require('./shared');

function checkServiceCoverage(projectRoot, warnings) {
  const archPath = ap.findArchPath(projectRoot);
  const todoPath = ap.findTodoPath(projectRoot);
  if (!archPath || !todoPath) return;

  const archText = read(archPath);
  const todoText = read(todoPath);
  if (!archText || !todoText) return;

  const components = ap.extractMermaidComponents(archText);
  if (!components.length) return;

  const todoLower = todoText.toLowerCase();
  for (const name of components) {
    if (name.length < 3) continue;
    if (!todoLower.includes(name.toLowerCase())) {
      warnings.push(
        `Artifact drift: ARCHITECTURE.md component "${name}" not referenced in todo.md work items`
      );
    }
  }
}

module.exports = checkServiceCoverage;
