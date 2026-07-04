# Activity Health Insights Add-on

Step-pattern health estimates for Home Assistant.

![release](https://img.shields.io/badge/release-v0.1.0-blue.svg)
![license](https://img.shields.io/badge/license-MIT-green.svg)
![python](https://img.shields.io/badge/python-3.11-yellow.svg)
![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Add--on-orange.svg)

[![Open your Home Assistant instance and show the add add-on repository dialog with this repository pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fresace3%2FFPCA_AFT_Health_Addon)

![Activity Health Insights dashboard](docs/screenshot.png)

---

## Overview

Activity Health Insights is an experimental Home Assistant add-on for:

- Functional data analysis
- Weekly activity modeling
- Survival prediction
- Longitudinal sensor analysis

The platform integrates Home Assistant sensor data with statistical modeling workflows.

---

## Features

- FPCA weekly activity scoring
- Long-term health estimate modeling
- Flask backend API
- Interactive frontend dashboard
- Home Assistant entity integration
- Remote-access compatible development workflow

---

## Architecture

```text
Home Assistant Sensors
        ↓
Backend API
        ↓
FPCA + Survival Models
        ↓
Frontend Dashboard
        ↓
Health Insights
```

---

## Installation

Click the button above to open Home Assistant and add this add-on repository.

If the button does not open the repository dialog, add it manually:

In Home Assistant:

```text
Settings → Add-ons → Add-on Store → Repositories
```

Add:

```text
https://github.com/resace3/FPCA_AFT_Health_Addon
```

Then:
- Refresh the Add-on Store
- Install `Activity Health Insights`
- Start the add-on
- Open Web UI
