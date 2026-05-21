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
          if (!canvas || canvas.width === 0 || canvas.height === 0) {
            return false
          }

          const context = canvas.getContext("2d")
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
          for (let index = 0; index < data.length; index += 1) {
            if (data[index] !== 0) {
              return true
            }
          }

          return false
        }
        """,
        selector,
    )


def test_frontend_renders_fpca_chart():
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1080})

        try:
            page.goto(BASE_URL, wait_until="domcontentloaded")

            page.wait_for_function(
                """() => {
                    const rawJson = document.querySelector('#rawJson')
                    return rawJson && rawJson.textContent.includes('fitbit_week_curve')
                }"""
            )

            page.get_by_role("tab", name="FPCA Score").click()

            page.wait_for_function(
                """() => {
                    const weeklySteps = document.querySelector('#weeklySteps')
                    return weeklySteps && weeklySteps.textContent.trim() !== 'Loading...'
                }"""
            )

            page.wait_for_function(
                """() => {
                    const canvas = document.querySelector('#fpcaChart')
                    return canvas && canvas.width > 0 && canvas.height > 0
                }"""
            )

            page.wait_for_function(
                """selector => {
                    const canvas = document.querySelector(selector)
                    if (!canvas || canvas.width === 0 || canvas.height === 0) {
                      return false
                    }

                    const context = canvas.getContext('2d')
                    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
                    for (let index = 0; index < data.length; index += 1) {
                      if (data[index] !== 0) {
                        return true
                      }
                    }

                    return false
                }""",
                "#fpcaChart",
            )

            assert page.locator("#fpcaScore").inner_text().strip() != "-"
            assert page.locator("#weeklySteps").inner_text().strip() != "-"
            assert _canvas_has_pixels(page, "#fpcaChart")
        finally:
            browser.close()
