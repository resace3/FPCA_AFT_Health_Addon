const metricElements = {
  mortality10yr: document.querySelectorAll('[data-metric-value="mortality10yr"]'),
  fpcaScore: document.querySelectorAll('[data-metric-value="fpcaScore"]'),
  weeklySteps: document.querySelectorAll('[data-metric-value="weeklySteps"]')
}

let survivalChart = null
let deathChart = null
let fpcaChart = null
let latestAftData = null
let latestFpcaData = null

function setMetricValue(name, value) {
  metricElements[name]?.forEach(element => {
    element.textContent = value
  })
}

function setLoadingState() {
  setMetricValue("mortality10yr", "Loading...")
  setMetricValue("fpcaScore", "Loading...")
  setMetricValue("weeklySteps", "Loading...")
}

function setUnavailableState() {
  setMetricValue("mortality10yr", "Unavailable")
  setMetricValue("fpcaScore", "Unavailable")
  setMetricValue("weeklySteps", "Unavailable")
}

function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-button")
  const tabPanels = document.querySelectorAll(".tab-panel")

  if (!tabButtons.length || !tabPanels.length) {
    return
  }

  const setActiveTab = tabId => {
    tabButtons.forEach(button => {
      const isActive = button.dataset.tab === tabId
      button.classList.toggle("active", isActive)
      button.setAttribute("aria-selected", String(isActive))
    })

    tabPanels.forEach(panel => {
      panel.classList.toggle("active", panel.id === `tab-${tabId}`)
    })

    if (tabId === "aft" && latestAftData) {
      renderAftCharts(makeSurvivalCurve(latestAftData))
    }

    if (tabId === "fpca" && latestFpcaData) {
      renderFpcaChart(latestFpcaData)
    }
  }

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab)
    })
  })
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

function formatPercent(value) {
  if (!isFiniteNumber(value)) {
    return "Unavailable"
  }
  return `${(value * 100).toFixed(1)}%`
}

function formatRounded(value) {
  if (!isFiniteNumber(value)) {
    return "Unavailable"
  }
  return Math.round(value).toLocaleString()
}

function formatSteps(value) {
  if (!isFiniteNumber(value)) {
    return "Unavailable"
  }
  return Math.round(value).toLocaleString()
}

function makeSurvivalCurve(aft) {
  const lp = aft?.linear_predictor_log_months
  const shape = aft?.weibull_shape

  if (!isFiniteNumber(lp) || !isFiniteNumber(shape)) {
    return null
  }

  const scaleParam = Math.exp(lp)
  const years = []
  const survival = []
  const death = []

  for (let month = 0; month <= 240; month += 6) {
    const year = month / 12
    const s = month === 0 ? 1 : Math.exp(-Math.pow(month / scaleParam, shape))

    years.push(year)
    survival.push(s)
    death.push(1 - s)
  }

  return { years, survival, death }
}

function makeSharedChartOptions(extraScales = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        display: false
      }
    },
    scales: extraScales
  }
}

function makeAxisOptions(overrides = {}) {
  const { ticks = {}, title = {}, ...axisOverrides } = overrides

  return {
    grid: {
      color: "rgba(148, 163, 184, 0.22)"
    },
    ticks: {
      color: "#64748b",
      font: {
        size: 12
      },
      ...ticks
    },
    title: {
      color: "#475569",
      font: {
        size: 12,
        weight: 600
      },
      ...title
    },
    ...axisOverrides
  }
}

function renderAftCharts(curve) {
  const survivalCtx = document.getElementById("survivalChart")
  const deathCtx = document.getElementById("deathChart")

  if (!curve || !window.Chart || !survivalCtx || !deathCtx) {
    return
  }

  if (survivalChart) {
    survivalChart.destroy()
  }

  if (deathChart) {
    deathChart.destroy()
  }

  const probabilityAxis = makeAxisOptions({
    min: 0,
    max: 1,
    ticks: {
      callback: value => `${Math.round(value * 100)}%`
    }
  })

  const yearAxis = makeAxisOptions({
    title: {
      display: true,
      text: "Years"
    }
  })

  survivalChart = new Chart(survivalCtx, {
    type: "line",
    data: {
      labels: curve.years,
      datasets: [
        {
          label: "Survival Probability",
          data: curve.survival,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.12)",
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.32,
          fill: true
        }
      ]
    },
    options: makeSharedChartOptions({
      x: yearAxis,
      y: probabilityAxis
    })
  })

  deathChart = new Chart(deathCtx, {
    type: "line",
    data: {
      labels: curve.years,
      datasets: [
        {
          label: "Death Probability",
          data: curve.death,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.32,
          fill: true
        }
      ]
    },
    options: makeSharedChartOptions({
      x: yearAxis,
      y: probabilityAxis
    })
  })
}

function renderFpcaChart(fpca) {
  const fpcaCtx = document.getElementById("fpcaChart")
  const mean = Array.isArray(fpca?.curves?.nhanes_mean_curve)
    ? fpca.curves.nhanes_mean_curve
    : []
  const shapeFunction = Array.isArray(fpca?.curves?.eigenfunction_1)
    ? fpca.curves.eigenfunction_1
    : []
  const multiplier = latestAftData?.input_FPCA_score_1

  if (
    !window.Chart
    || !fpcaCtx
    || !mean.length
    || !shapeFunction.length
    || !isFiniteNumber(multiplier)
  ) {
    return
  }

  const patternCurve = mean.map((meanValue, index) => {
    const shapeValue = shapeFunction[index] || 0
    return meanValue + multiplier * shapeValue
  })

  const labels = mean.map((_, index) => {
    const hour = index % 24
    if (hour !== 0) {
      return ""
    }
    const day = Math.floor(index / 24) + 1
    return `Day ${day}`
  })

  if (fpcaChart) {
    fpcaChart.destroy()
  }

  fpcaChart = new Chart(fpcaCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Your Pattern Curve",
          data: patternCurve,
          borderColor: "#0f172a",
          backgroundColor: "rgba(15, 23, 42, 0.08)",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.25,
          fill: false
        },
        {
          label: "NHANES Mean Curve",
          data: mean,
          borderColor: "#7c3aed",
          backgroundColor: "rgba(124, 58, 237, 0.10)",
          borderWidth: 2.5,
          borderDash: [7, 7],
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.25,
          fill: false
        }
      ]
    },
    options: makeSharedChartOptions({
      y: makeAxisOptions({
        title: {
          display: true,
          text: "Hourly Steps"
        }
      }),
      x: makeAxisOptions({
        ticks: {
          autoSkip: false,
          maxRotation: 0,
          callback: (_, index) => labels[index]
        }
      })
    })
  })
}

async function loadBackend() {
  setLoadingState()

  try {
    const response = await fetch("./api/aft")
    const contentType = response.headers.get("content-type") || ""

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    if (!contentType.includes("application/json")) {
      const text = await response.text()
      throw new Error(`Unexpected content-type: ${contentType} | ${text}`)
    }

    const data = await response.json()
    const aft = data?.aft
    const fpca = data?.fpca

    latestAftData = aft
    latestFpcaData = fpca

    setMetricValue(
      "mortality10yr",
      formatPercent(aft?.predicted_probability_of_dying_within_10_years)
    )
    setMetricValue("fpcaScore", formatRounded(aft?.input_FPCA_score_1))
    setMetricValue(
      "weeklySteps",
      formatSteps(fpca?.summary?.total_steps_last_7_complete_days)
    )

    const activeTab = document.querySelector(".tab-button.active")?.dataset.tab || "aft"

    if (activeTab === "aft") {
      renderAftCharts(makeSurvivalCurve(aft))
    }

    if (activeTab === "fpca") {
      renderFpcaChart(fpca)
    }
  } catch (error) {
    console.error("Error loading Activity Health Insights backend", error)
    setUnavailableState()
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs()
  loadBackend()
})
