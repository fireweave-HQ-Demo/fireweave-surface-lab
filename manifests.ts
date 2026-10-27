/**
 * One manifest list for both enumerations. The scanner and the investigator
 * have to agree on what a unit is, or the diff compares two different trees.
 */
const NAMES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Package.swift",
  "pubspec.yaml",
  "Gemfile",
  "composer.json",
  "mix.exs",
  "Dockerfile",
  "Procfile",
  "index.html",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
] as const;

const EXACT = new Set<string>(NAMES);

export function isManifestName(name: string): boolean {
  return EXACT.has(name) || name.endsWith(".csproj");
}
