import { readFileSync } from "node:fs"

interface Totals {
  linesFound: number
  linesHit: number
  functionsFound: number
  functionsHit: number
  branchesFound: number
  branchesHit: number
}

function parseCoverage(path: string): Totals {
  const content = readFileSync(path, "utf8")
  const lines = content.split("\n")

  const totals: Totals = {
    linesFound: 0,
    linesHit: 0,
    functionsFound: 0,
    functionsHit: 0,
    branchesFound: 0,
    branchesHit: 0,
  }

  for (const line of lines) {
    if (line.startsWith("LF:")) {
      totals.linesFound += Number.parseInt(line.slice(3), 10)
    } else if (line.startsWith("LH:")) {
      totals.linesHit += Number.parseInt(line.slice(3), 10)
    } else if (line.startsWith("FNF:")) {
      totals.functionsFound += Number.parseInt(line.slice(4), 10)
    } else if (line.startsWith("FNH:")) {
      totals.functionsHit += Number.parseInt(line.slice(4), 10)
    } else if (line.startsWith("BRF:")) {
      totals.branchesFound += Number.parseInt(line.slice(4), 10)
    } else if (line.startsWith("BRH:")) {
      totals.branchesHit += Number.parseInt(line.slice(4), 10)
    }
  }

  return totals
}

function percent(hit: number, found: number): number {
  if (found === 0) {
    return 100
  }
  return (hit / found) * 100
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

const lcovPath = Bun.argv[2] ?? "coverage/lcov.info"
const totals = parseCoverage(lcovPath)

const linePct = percent(totals.linesHit, totals.linesFound)
const functionPct = percent(totals.functionsHit, totals.functionsFound)
const branchPct = percent(totals.branchesHit, totals.branchesFound)

// LCOV does not expose statements as a separate metric. We map statements to line coverage.
const statementPct = linePct

console.log(`Coverage from ${lcovPath}`)
console.log(`lines: ${formatPercent(linePct)} (${totals.linesHit}/${totals.linesFound})`)
console.log(`functions: ${formatPercent(functionPct)} (${totals.functionsHit}/${totals.functionsFound})`)
console.log(`statements: ${formatPercent(statementPct)} (mapped to line coverage)`)
console.log(`branches: ${formatPercent(branchPct)} (${totals.branchesHit}/${totals.branchesFound})`)

const failed: string[] = []
if (linePct < 100) failed.push("lines")
if (functionPct < 100) failed.push("functions")
if (statementPct < 100) failed.push("statements")
if (branchPct < 100) failed.push("branches")

if (failed.length > 0) {
  console.error(`Coverage gate failed for: ${failed.join(", ")}`)
  process.exit(1)
}
