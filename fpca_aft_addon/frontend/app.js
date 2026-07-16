const charts = new Map()
let latestPayload = null

const byId = id => document.getElementById(id)
const isFiniteNumber = value => typeof value === "number" && Number.isFinite(value)

function replaceChart(id, config) {
  charts.get(id)?.destroy()
  const canvas = byId(id)
  if (!canvas || !window.Chart) return null
  const chart = new Chart(canvas, config)
  charts.set(id, chart)
  return chart
}

function chartOptions(scales = {}, tooltipCallbacks = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { callbacks: tooltipCallbacks } },
    scales
  }
}

function axisOptions(overrides = {}) {
  return {
    border: { display: false },
    grid: { color: "rgba(148, 163, 184, 0.16)", drawTicks: false },
    ticks: { color: "#64748b", padding: 9, font: { size: 11 } },
    ...overrides
  }
}

function setConnectionState(state, label) {
  const pill = byId("connection-status")
  pill.classList.toggle("is-checking", state === "checking")
  pill.classList.toggle("is-unavailable", state === "unavailable")
  byId("connection-status-text").textContent = label
}

async function checkConnection() {
  setConnectionState("checking", "Checking connection")
  try {
    const response = await fetch("./api/health", { cache: "no-store" })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    setConnectionState("connected", "Connected to Home Assistant")
  } catch (error) {
    setConnectionState("unavailable", "Connection unavailable")
  }
}

function selectTab(tabId, { focus = false } = {}) {
  const buttons = [...document.querySelectorAll('[role="tab"]')]
  const panels = [...document.querySelectorAll('[role="tabpanel"]')]
  buttons.forEach(button => {
    const active = button.dataset.tab === tabId
    button.classList.toggle("active", active)
    button.setAttribute("aria-selected", String(active))
    button.tabIndex = active ? 0 : -1
    if (active && focus) button.focus()
  })
  panels.forEach(panel => {
    const active = panel.id === `tab-${tabId}`
    panel.classList.toggle("active", active)
    panel.hidden = !active
  })
  if (latestPayload) requestAnimationFrame(() => renderChartsForTab(tabId, latestPayload))
}

function initTabs() {
  const buttons = [...document.querySelectorAll('[role="tab"]')]
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => selectTab(button.dataset.tab))
    button.addEventListener("keydown", event => {
      let next = index
      if (event.key === "ArrowRight") next = (index + 1) % buttons.length
      else if (event.key === "ArrowLeft") next = (index - 1 + buttons.length) % buttons.length
      else if (event.key === "Home") next = 0
      else if (event.key === "End") next = buttons.length - 1
      else return
      event.preventDefault()
      selectTab(buttons[next].dataset.tab, { focus: true })
    })
  })
  byId("open-configuration").addEventListener("click", () => selectTab("configuration", { focus: true }))
}

function setProfileStatus(message, isError = false) {
  const status = byId("profile-status")
  status.textContent = message
  status.classList.toggle("error", isError)
}

function populateProfile(profile) {
  const form = byId("profile-form")
  Object.entries(profile || {}).forEach(([name, value]) => {
    const field = form.elements.namedItem(name)
    if (field) field.value = value
  })
}

async function loadProfile() {
  try {
    const response = await fetch("./api/profile", { cache: "no-store" })
    if (!response.ok) throw new Error("Unable to load profile")
    populateProfile(await response.json())
  } catch (error) {
    setProfileStatus("Could not load your profile.", true)
  }
}

function initProfileForm() {
  const form = byId("profile-form")
  form.addEventListener("submit", async event => {
    event.preventDefault()
    if (!form.reportValidity()) return
    const saveButton = byId("save-profile")
    const profile = Object.fromEntries(new FormData(form).entries())
    profile.age = Number(profile.age)
    profile.bmi = Number(profile.bmi)
    saveButton.disabled = true
    setProfileStatus("Saving...")
    try {
      const response = await fetch("./api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || "Unable to save profile")
      populateProfile(result)
      setProfileStatus("Saved. Refreshing estimate...")
      try {
        await loadDashboard({ throwOnError: true })
        setProfileStatus("Saved.")
      } catch (error) {
        setProfileStatus("Saved, but the estimate could not be refreshed.", true)
      }
    } catch (error) {
      setProfileStatus(error.message || "Could not save your profile.", true)
    } finally {
      saveButton.disabled = false
    }
  })
}

function formatSteps(value) {
  return isFiniteNumber(value) ? Math.round(value).toLocaleString() : "Unavailable"
}

function formatHour(hour) {
  if (!Number.isInteger(hour)) return "Unavailable"
  const normalized = ((hour % 24) + 24) % 24
  if (normalized === 0) return "12 AM"
  if (normalized === 12) return "12 PM"
  return `${normalized > 12 ? normalized - 12 : normalized} ${normalized >= 12 ? "PM" : "AM"}`
}

function renderGauge(aft) {
  const risk = aft?.predicted_probability_of_dying_within_10_years
  const available = isFiniteNumber(risk)
  const percent = available ? risk * 100 : null
  byId("mortality-risk").textContent = available ? `${percent.toFixed(1)}%` : "Unavailable"
  byId("risk-gauge-value").style.strokeDasharray = `${available ? Math.min(100, Math.max(0, percent)) : 0} 100`
  byId("risk-gauge-needle").style.transform = `rotate(${available ? -90 + Math.min(100, Math.max(0, percent)) * 1.8 : -90}deg)`
  byId("risk-gauge").setAttribute("aria-label", available
    ? `Estimated 10-year risk of mortality: ${percent.toFixed(1)} percent. Model estimate.`
    : "Estimated 10-year risk of mortality is unavailable.")
  byId("risk-card").setAttribute("aria-busy", "false")
}

function comparisonText(value, element) {
  element.classList.remove("up", "down")
  if (!isFiniteNumber(value)) return "Unavailable"
  if (Math.abs(value) < 2) return "No meaningful change"
  element.classList.add(value > 0 ? "up" : "down")
  return `${value > 0 ? "Up" : "Down"} ${Math.abs(value).toFixed(0)}%`
}

function renderText(payload) {
  const aft = payload?.aft
  const fpca = payload?.fpca
  const ui = fpca?.ui || {}
  renderGauge(aft)
  byId("weekly-steps").textContent = formatSteps(fpca?.summary?.total_steps_last_7_complete_days)
  const change = ui.weekly_change_percent
  const changeLabel = byId("weekly-change")
  changeLabel.classList.remove("is-positive", "is-negative")
  if (isFiniteNumber(change)) {
    changeLabel.textContent = `${change >= 0 ? "Up" : "Down"} ${Math.abs(change).toFixed(0)}% vs prior complete week`
    changeLabel.classList.add(change >= 0 ? "is-positive" : "is-negative")
    byId("week-change-copy").textContent = Math.abs(change) < 2
      ? "Your activity was similar to the prior complete week."
      : `Your total steps ${change > 0 ? "increased" : "decreased"} ${Math.abs(change).toFixed(0)}% from the prior complete week.`
  } else {
    changeLabel.textContent = "Last 7 complete days"
    byId("week-change-copy").textContent = "Not enough prior data for a week-to-week comparison."
  }
  const windowData = ui.most_active_window
  const windowText = windowData && Number.isInteger(windowData.start_hour)
    ? `${formatHour(windowData.start_hour)} - ${formatHour(windowData.end_hour)}`
    : "Unavailable"
  byId("active-window").textContent = windowText
  byId("strongest-pattern").textContent = windowText === "Unavailable"
    ? "Activity timing is unavailable."
    : `You move most during ${windowText}.`
  const opportunity = {
    morning: "A short morning walk could make your day more balanced.",
    afternoon: "A short afternoon walk could make your day more balanced.",
    evening: "A short evening walk could make your day more balanced."
  }[ui.lowest_activity_daytime_period]
  byId("activity-opportunity").textContent = opportunity || "More activity data is needed to identify a daytime opportunity."
  const representedDays = ui.hourly_average_days
  byId("hourly-days-copy").textContent = Number.isInteger(representedDays)
    ? `Based on ${representedDays} complete ${representedDays === 1 ? "day" : "days"} in your configured timezone`
    : "Complete-day coverage unavailable"
  const period = ui.period_comparison || {}
  byId("comparison-baseline").textContent = period.baseline_label && period.baseline_label !== "Unavailable"
    ? `Compared with ${period.baseline_label}`
    : "No earlier baseline is available"
  for (const key of ["morning", "afternoon", "evening"]) {
    const element = byId(`comparison-${key}`)
    element.textContent = comparisonText(period[key], element)
  }
  document.querySelectorAll("[aria-busy='true']").forEach(element => element.setAttribute("aria-busy", "false"))
}

function renderOverviewCharts(payload) {
  const fpca = payload?.fpca
  const ui = fpca?.ui || {}
  const labels = Array.isArray(ui.daily_labels) ? ui.daily_labels : []
  const daily = Array.isArray(ui.daily_steps) ? ui.daily_steps : []
  const dailyAvailable = labels.length === 7 && daily.length === 7 && daily.every(isFiniteNumber)
  byId("weekly-chart-fallback").hidden = dailyAvailable
  if (dailyAvailable) {
    replaceChart("weekly-steps-chart", {
      type: "bar",
      data: { labels, datasets: [{ data: daily, backgroundColor: "rgba(71, 112, 255, .72)", borderRadius: 4, borderSkipped: false, maxBarThickness: 34 }] },
      options: chartOptions({
        x: axisOptions({ grid: { display: false } }),
        y: axisOptions({ beginAtZero: true, ticks: { display: false }, grid: { display: false } })
      }, { label: context => `${Math.round(context.raw).toLocaleString()} steps` })
    })
    replaceChart("weekly-sparkline", {
      type: "line",
      data: { labels, datasets: [{ data: daily, borderColor: "#2563eb", backgroundColor: "rgba(37, 99, 235, .08)", borderWidth: 2, pointRadius: 3, pointBackgroundColor: "#fff", pointBorderWidth: 2, tension: .25, fill: true }] },
      options: chartOptions({
        x: axisOptions({ grid: { display: false } }),
        y: axisOptions({ display: false, beginAtZero: false })
      }, { label: context => `${Math.round(context.raw).toLocaleString()} steps` })
    })
  }
  const lp = payload?.aft?.linear_predictor_log_months
  const shape = payload?.aft?.weibull_shape
  const survivalAvailable = isFiniteNumber(lp) && isFiniteNumber(shape)
  byId("survival-chart-fallback").hidden = survivalAvailable
  if (survivalAvailable) {
    const scale = Math.exp(lp)
    const points = []
    for (let month = 0; month <= 120; month += 6) {
      points.push({ x: month / 12, y: month === 0 ? 1 : Math.exp(-Math.pow(month / scale, shape)) })
    }
    replaceChart("survival-chart", {
      type: "line",
      data: { datasets: [{ data: points, borderColor: "#2563eb", backgroundColor: "rgba(37, 99, 235, .08)", borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, tension: .22, fill: true }] },
      options: chartOptions({
        x: axisOptions({ type: "linear", min: 0, max: 10, title: { display: true, text: "Years", color: "#64748b" }, ticks: { stepSize: 2, color: "#64748b" } }),
        y: axisOptions({ min: 0, max: 1, ticks: { stepSize: .2, color: "#64748b", callback: value => `${Math.round(value * 100)}%` } })
      }, {
        title: items => `${items[0].parsed.x} years`,
        label: context => `${(context.parsed.y * 100).toFixed(1)}% survival probability`
      })
    })
  }
}

function renderRhythmChart(payload) {
  const ui = payload?.fpca?.ui || {}
  const values = Array.isArray(ui.hourly_average_steps) ? ui.hourly_average_steps : []
  const available = values.length === 24 && values.every(isFiniteNumber)
  byId("hourly-chart-fallback").hidden = available
  if (!available) return
  const labels = values.map((_, hour) => ({ 0: "12 AM", 6: "6 AM", 12: "12 PM", 18: "6 PM", 23: "12 AM" })[hour] || "")
  replaceChart("hourly-steps-chart", {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: values.map((_, hour) => `rgba(${hour < 7 || hour > 21 ? "113, 94, 255" : "67, 97, 238"}, ${.42 + hour / 80})`),
        borderRadius: 5,
        borderSkipped: false,
        maxBarThickness: 24
      }]
    },
    options: chartOptions({
      x: axisOptions({ grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, color: "#64748b" } }),
      y: axisOptions({ beginAtZero: true, title: { display: true, text: "Average steps", color: "#64748b" } })
    }, {
      title: items => {
        const hour = items[0].dataIndex
        return `${formatHour(hour)} - ${formatHour(hour + 1)}`
      },
      label: context => `${Math.round(context.raw).toLocaleString()} average steps across ${ui.hourly_average_days || 0} complete days`
    })
  })
}

function renderChartsForTab(tabId, payload) {
  if (tabId === "overview") renderOverviewCharts(payload)
  if (tabId === "rhythm") renderRhythmChart(payload)
}

function setDashboardUnavailable(message) {
  byId("mortality-risk").textContent = "Unavailable"
  byId("weekly-steps").textContent = "Unavailable"
  byId("risk-gauge-value").style.strokeDasharray = "0 100"
  byId("risk-gauge").setAttribute("aria-label", "Estimated 10-year risk of mortality is unavailable.")
  byId("dashboard-error-copy").textContent = message || "Check your steps entity and timezone in Configuration."
  byId("dashboard-error").hidden = false
  document.querySelectorAll("[aria-busy='true']").forEach(element => element.setAttribute("aria-busy", "false"))
}

async function loadDashboard({ throwOnError = false } = {}) {
  byId("dashboard-error").hidden = true
  try {
    const response = await fetch("./api/aft", { cache: "no-store" })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || `HTTP ${response.status}`)
    latestPayload = result
    renderText(result)
    const activeTab = document.querySelector('[role="tab"][aria-selected="true"]')?.dataset.tab || "overview"
    renderChartsForTab(activeTab, result)
    return result
  } catch (error) {
    setDashboardUnavailable(error.message)
    if (throwOnError) throw error
    return null
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initTabs()
  initProfileForm()
  checkConnection()
  loadProfile()
  loadDashboard()
})
