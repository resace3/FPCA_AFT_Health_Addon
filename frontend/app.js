const loadButton = document.getElementById("loadButton")

const ageAtDeath = document.getElementById("ageAtDeath")
const mortality10yr = document.getElementById("mortality10yr")
const fpcaScore = document.getElementById("fpcaScore")
const weeklySteps = document.getElementById("weeklySteps")
const rawJson = document.getElementById("rawJson")

let survivalChart = null
let deathChart = null

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

async function loadBackend() {
  ageAtDeath.textContent = "Loading..."
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

    ageAtDeath.textContent =
      `${aft.predicted_median_age_at_death.toFixed(1)} years`

    mortality10yr.textContent =
      `${(aft.predicted_probability_of_dying_within_10_years * 100).toFixed(1)}%`

    fpcaScore.textContent =
      aft.input_FPCA_score_1.toFixed(0)

    weeklySteps.textContent =
      fpca.summary.total_steps_last_7_complete_days.toLocaleString()

    const curve = makeSurvivalCurve(aft)

    renderCharts(curve)

    rawJson.textContent =
      JSON.stringify(data, null, 2)

  } catch (error) {
    rawJson.textContent =
      `Error loading backend: ${error}`
  }
}

loadButton.addEventListener("click", loadBackend)
