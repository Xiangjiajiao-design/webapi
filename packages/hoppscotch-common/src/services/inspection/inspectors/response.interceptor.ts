import { Service } from "dioc"
import {
  Checks,
  InspectionService,
  Inspector,
  InspectorChecks,
  InspectorResult,
} from ".."
import { getI18n } from "~/modules/i18n"
import { HoppRESTRequest } from "@hoppscotch/data"
import { Ref, markRaw, ref } from "vue"
import IconAlertTriangle from "~icons/lucide/alert-triangle"
import { HoppRESTResponse } from "~/helpers/types/HoppRESTResponse"

// interface ResponseErrors {
//   errors: "NO_NETWORK" | "401_STATUS"
// }

export class ResponseInspectorService extends Service implements Inspector {
  public static readonly ID = "RESPONSE_INSPECTOR_SERVICE"

  private t = getI18n()

  public readonly inspectorID = "response"

  private readonly inspection = this.bind(InspectionService)

  constructor() {
    super()

    this.inspection.registerInspector(this)
  }

  getInspectorFor(
    req: HoppRESTRequest,
    res: HoppRESTResponse,
    checks: InspectorChecks,
    componentRefID: Ref<string>
  ): InspectorResult[] {
    const results = ref<InspectorResult[]>([])
    if (!res) return results.value

    const isCheckContains = (check: Checks) => {
      return checks.includes(check)
    }

    const hasErrors = res && (res.type !== "success" || res.statusCode !== 200)

    let text

    if (res.type === "network_fail") {
      text = this.t("inspections.response.network_fail")
    } else if (res.type === "fail") {
      text = this.t("inspections.response.fail")
    } else if (res.type === "success" && res.statusCode === 404) {
      text = this.t("inspections.response.success_404")
    } else if (res.type === "success" && res.statusCode === 401) {
      text = this.t("inspections.response.success_401")
    } else {
      text = this.t("inspections.response.success")
    }

    if (isCheckContains("response_errors") && hasErrors) {
      results.value.push({
        id: "url",
        componentRefID: componentRefID.value,
        icon: markRaw(IconAlertTriangle),
        text: {
          type: "text",
          text: text,
        },
        // action: {
        //   text: this.t("context_menu.set_environment_variable"),
        //   apply: () => {
        //     console.log("apply")
        //   },
        // },
        severity: 2,
        isApplicable: true,
      })
    }

    return results.value
  }
}
