import { Component, markRaw, reactive } from "vue"
import { getI18n } from "~/modules/i18n"
import { SpotlightSearcherResult, SpotlightService } from ".."
import {
  SearchResult,
  StaticSpotlightSearcherService,
} from "./base/static.searcher"

import {
  closeOtherTabs,
  closeTab,
  createNewTab,
  currentTabID,
} from "~/helpers/rest/tab"
import IconWindow from "~icons/lucide/app-window"
import { getDefaultRESTRequest } from "~/helpers/rest/default"

type Doc = {
  text: string
  alternates: string[]
  icon: object | Component
}

/**
 *
 * This searcher is responsible for providing REST Tab related actions on the spotlight results.
 *
 * NOTE: Initializing this service registers it as a searcher with the Spotlight Service.
 */
export class TabSpotlightSearcherService extends StaticSpotlightSearcherService<Doc> {
  public static readonly ID = "TAB_SPOTLIGHT_SEARCHER_SERVICE"

  private t = getI18n()

  public readonly searcherID = "tab"
  public searcherSectionTitle = this.t("spotlight.tab.title")

  private readonly spotlight = this.bind(SpotlightService)

  private documents: Record<string, Doc> = reactive({
    close_current_tab: {
      text: this.t("spotlight.tab.close_current"),
      alternates: ["tab", "close", "close tab"],
      icon: markRaw(IconWindow),
    },
    close_others_tab: {
      text: this.t("spotlight.tab.close_others"),
      alternates: ["tab", "close", "close all"],
      icon: markRaw(IconWindow),
    },
    open_new_tab: {
      text: this.t("spotlight.tab.new_tab"),
      alternates: ["tab", "new", "open tab"],
      icon: markRaw(IconWindow),
    },
  })

  constructor() {
    super({
      searchFields: ["text", "alternates"],
      fieldWeights: {
        text: 2,
        alternates: 1,
      },
    })

    this.setDocuments(this.documents)
    this.spotlight.registerSearcher(this)
  }

  protected getSearcherResultForSearchResult(
    result: SearchResult<Doc>
  ): SpotlightSearcherResult {
    return {
      id: result.id,
      icon: result.doc.icon,
      text: { type: "text", text: result.doc.text },
      score: result.score,
    }
  }

  public onDocSelected(id: string): void {
    if (id === "close_current_tab") closeTab(currentTabID.value)
    if (id === "close_others_tab") closeOtherTabs(currentTabID.value)
    if (id === "open_new_tab")
      createNewTab({
        request: getDefaultRESTRequest(),
        isDirty: false,
      })
  }
}
