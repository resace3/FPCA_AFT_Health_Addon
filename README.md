# FPCA AFT Health Add-on

Activity-based survival modeling for Home Assistant.

![release](https://img.shields.io/badge/release-v0.1.0-blue.svg)
![license](https://img.shields.io/badge/license-MIT-green.svg)
![python](https://img.shields.io/badge/python-3.11-yellow.svg)
![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Add--on-orange.svg)

---

## Overview

FPCA AFT Health Add-on is an experimental Home Assistant add-on for:

- Functional data analysis
- Weekly activity modeling
- Survival prediction
- Longitudinal sensor analysis

The platform integrates Home Assistant sensor data with statistical modeling workflows.

---

## Features

- FPCA weekly activity scoring
- Weibull AFT modeling
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
- Install `FPCA AFT Health Add-on`
- Start the add-on
- Open Web UI
