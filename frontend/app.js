const mortality10yr = document.getElementById("mortality10yr")
const fpcaScore = document.getElementById("fpcaScore")
const weeklySteps = document.getElementById("weeklySteps")
const rawJson = document.getElementById("rawJson")

let survivalChart = null
let deathChart = null
let fpcaChart = null

function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-button")
  const tabPanels = document.querySelectorAll(".tab-panel")

  if (!tabButtons.length || !tabPanels.length) {
    return
  }

  const setActiveTab = tabId => {
    tabButtons.forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.tab === tabId
      )
      button.setAttribute(
        "aria-selected",
        button.dataset.tab === tabId
      )
    })

    tabPanels.forEach(panel => {
      panel.classList.toggle(
        "active",
        panel.id === `tab-${tabId}`
      )
    })
  }

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab)
    })
  })
}

function makeSurvivalCurve(aft) {
  const lp = aft.linear_predictor_log_months
  const shape = aft.weibull_shape
  const scaleParam = Math.exp(lp)

  const years = []
  const survival = []
  const death = []

  for (let month = 0; month <= 240; month += 6) {
    const year = month / 12

    let s = 1.0

    if (month > 0) {
      s = Math.exp(
        -Math.pow(month / scaleParam, shape)
      )
    }

    years.push(year)
    survival.push(s)
    death.push(1 - s)
  }

  return {
    years,
    survival,
    death
  }
}

function renderCharts(curve) {
  const survivalCtx =
    document.getElementById("survivalChart")

  const deathCtx =
    document.getElementById("deathChart")

  if (survivalChart) {
    survivalChart.destroy()
  }

  if (deathChart) {
    deathChart.destroy()
  }

  survivalChart = new Chart(survivalCtx, {
    type: "line",
    data: {
      labels: curve.years,
      datasets: [
        {
          label: "Survival Probability",
          data: curve.survival,
          borderWidth: 3,
          borderColor: "#1d4ed8",
          backgroundColor: "rgba(29, 78, 216, 0.15)",
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          min: 0,
          max: 1,
          ticks: {
            callback: value =>
              `${Math.round(value * 100)}%`
          }
        },
        x: {
          title: {
            display: true,
            text: "Years"
          }
        }
      }
    }
  })

  deathChart = new Chart(deathCtx, {
    type: "line",
    data: {
      labels: curve.years,
      datasets: [
        {
          label: "Death Probability",
          data: curve.death,
          borderWidth: 3,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          min: 0,
          max: 1,
          ticks: {
            callback: value =>
              `${Math.round(value * 100)}%`
          }
        },
        x: {
          title: {
            display: true,
            text: "Years"
          }
        }
      }
    }
  })
}

function renderFpcaChart(fpca) {
  const fpcaCtx = document.getElementById("fpcaChart")
  if (!fpcaCtx || !fpca?.curves) {
    return
  }

  const fitbit = fpca.curves.fitbit_week_curve || []
  const mean = fpca.curves.nhanes_mean_curve || []

  const labels = fitbit.map((_, index) => {
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
          label: "Your Hourly Steps",
          data: fitbit,
          borderWidth: 2,
          borderColor: "#0f172a",
          backgroundColor: "rgba(15, 23, 42, 0.08)",
          tension: 0.25
        },
        {
          label: "NHANES Mean Curve",
          data: mean,
          borderWidth: 2,
          borderColor: "#6366f1",
          backgroundColor: "rgba(99, 102, 241, 0.12)",
          borderDash: [6, 6],
          tension: 0.25
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          title: {
            display: true,
            text: "Hourly Steps"
          }
        },
        x: {
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            callback: (_, index) => labels[index]
          }
        }
      }
    }
  })
}

async function loadBackend() {
  mortality10yr.textContent = "Loading..."
  fpcaScore.textContent = "Loading..."
  weeklySteps.textContent = "Loading..."

  try {
    const response = await fetch("./api/aft")
    const contentType =
      response.headers.get("content-type") || ""

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `HTTP ${response.status}: ${text}`
      )
    }

    if (!contentType.includes("application/json")) {
      const text = await response.text()
      throw new Error(
        `Unexpected content-type: ${contentType} | ${text}`
      )
    }

    const data = await response.json()

    const aft = data.aft
    const fpca = data.fpca


    mortality10yr.textContent =
      `${(aft.predicted_probability_of_dying_within_10_years * 100).toFixed(1)}%`

    fpcaScore.textContent =
      aft.input_FPCA_score_1.toFixed(0)

    weeklySteps.textContent =
      fpca.summary.total_steps_last_7_complete_days.toLocaleString()

    const curve = makeSurvivalCurve(aft)

    renderCharts(curve)
    renderFpcaChart(fpca)

    rawJson.textContent =
      JSON.stringify(data, null, 2)

  } catch (error) {
    rawJson.textContent =
      `Error loading backend: ${error}`
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs()
  loadBackend()
})
