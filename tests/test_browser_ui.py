import os

import pytest

if not os.environ.get("RUN_BROWSER_TESTS"):
    pytest.skip("browser smoke test disabled", allow_module_level=True)

BASE_URL = os.environ.get("BROWSER_BASE_URL", "http://127.0.0.1:5056")


def _canvas_has_pixels(page, selector):
    return page.evaluate(
        """
        selector => {
          const canvas = document.querySelector(selector)
          if (!canvas || canvas.width === 0 || canvas.height === 0) return false
          const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
          return data.some(channel => channel !== 0)
        }
        """,
        selector,
    )


def _wait_for_canvas_pixels(page, selector):
    page.wait_for_function(
        """
        selector => {
          const canvas = document.querySelector(selector)
          if (!canvas || canvas.width === 0 || canvas.height === 0) return false
          const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
          return data.some(channel => channel !== 0)
        }
        """,
        selector,
    )


def test_three_tab_dashboard_is_functional_and_responsive():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1080})
        console_errors = []
        page.on(
            "console",
            lambda message: (
                console_errors.append(message.text) if message.type == "error" else None
            ),
        )

        try:
            page.goto(BASE_URL, wait_until="networkidle")
            page.wait_for_function(
                """() => {
                  const value = document.querySelector('#weekly-steps')?.textContent.trim()
                  return value && value !== 'Loading...' && value !== 'Unavailable'
                }"""
            )

            tabs = page.get_by_role("tab").all()
            assert [tab.inner_text().strip() for tab in tabs] == [
                "Overview",
                "Activity Rhythm",
                "Configuration",
            ]
            assert page.get_by_role("tab", name="Overview").get_attribute("aria-selected") == "true"
            assert page.locator("#mortality-risk").inner_text().endswith("%")
            assert _canvas_has_pixels(page, "#weekly-steps-chart")
            assert _canvas_has_pixels(page, "#survival-chart")
            assert _canvas_has_pixels(page, "#weekly-sparkline")
            assert "Activity Pattern Multiplier" not in page.locator("body").inner_text()
            assert "FPCA score" not in page.locator("body").inner_text()

            page.get_by_role("tab", name="Overview").focus()
            page.keyboard.press("ArrowRight")
            assert (
                page.get_by_role("tab", name="Activity Rhythm").get_attribute("aria-selected")
                == "true"
            )
            _wait_for_canvas_pixels(page, "#hourly-steps-chart")
            assert _canvas_has_pixels(page, "#hourly-steps-chart")
            assert page.locator("#active-window").inner_text() != "Unavailable"

            page.keyboard.press("End")
            assert (
                page.get_by_role("tab", name="Configuration").get_attribute("aria-selected")
                == "true"
            )
            assert page.locator("#profile-form").is_visible()
            assert page.locator('[name="steps_entity_id"]').input_value()
            assert page.get_by_role("button", name="Save profile").is_visible()

            page.set_viewport_size({"width": 390, "height": 844})
            page.get_by_role("tab", name="Overview").click()
            page.wait_for_timeout(100)
            dimensions = page.evaluate(
                """() => ({
                  documentWidth: document.documentElement.scrollWidth,
                  viewportWidth: document.documentElement.clientWidth
                })"""
            )
            assert dimensions["documentWidth"] <= dimensions["viewportWidth"] + 1
            assert (
                page.locator(".overview-top-grid").evaluate(
                    "element => getComputedStyle(element).gridTemplateColumns.split(' ').length"
                )
                == 1
            )
            assert not console_errors
        finally:
            browser.close()
