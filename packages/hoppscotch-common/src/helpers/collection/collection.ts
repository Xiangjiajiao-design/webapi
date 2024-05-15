import { HoppCollection } from "@hoppscotch/data"
import * as E from "fp-ts/Either"

import { getService } from "~/modules/dioc"
import { GQLTabService } from "~/services/tab/graphql"
import { RESTTabService } from "~/services/tab/rest"
import { runGQLQuery } from "../backend/GQLClient"
import { GetSingleRequestDocument } from "../backend/graphql"
import { HoppGQLSaveContext } from "../graphql/document"
import { HoppRESTSaveContext } from "../rest/document"
import { HoppInheritedProperty } from "../types/HoppInheritedProperties"
import { getAffectedIndexes } from "./affectedIndex"

/**
 * Resolve save context on reorder
 * @param payload
 * @param payload.lastIndex
 * @param payload.newIndex
 * @param folderPath
 * @param payload.length
 * @returns
 */

export function resolveSaveContextOnCollectionReorder(payload: {
  lastIndex: number
  newIndex: number
  folderPath: string
  length?: number // better way to do this? now it could be undefined
}) {
  const { lastIndex, folderPath, length } = payload
  let { newIndex } = payload

  if (newIndex > lastIndex) newIndex-- // there is a issue when going down? better way to resolve this?
  if (lastIndex === newIndex) return

  const affectedIndexes = getAffectedIndexes(
    lastIndex,
    newIndex === -1 ? length! : newIndex
  )

  if (newIndex === -1) {
    // if (newIndex === -1) remove it from the map because it will be deleted
    affectedIndexes.delete(lastIndex)
  }

  // add folder path as prefix to the affected indexes
  const affectedPaths = new Map<string, string>()
  for (const [key, value] of affectedIndexes) {
    if (folderPath) {
      affectedPaths.set(`${folderPath}/${key}`, `${folderPath}/${value}`)
    } else {
      affectedPaths.set(key.toString(), value.toString())
    }
  }

  const tabService = getService(RESTTabService)

  const tabs = tabService.getTabsRefTo((tab) => {
    if (tab.document.saveContext?.originLocation === "user-collection") {
      return affectedPaths.has(tab.document.saveContext.folderPath)
    }

    if (
      tab.document.saveContext?.originLocation !== "workspace-user-collection"
    ) {
      return false
    }

    const requestHandleRef = tab.document.saveContext.requestHandle?.get()

    if (!requestHandleRef || requestHandleRef.value.type === "invalid") {
      return false
    }

    const { requestID } = requestHandleRef.value.data

    const collectionID = requestID.split("/").slice(0, -1).join("/")

    return affectedPaths.has(collectionID)
  })

  for (const tab of tabs) {
    if (tab.value.document.saveContext?.originLocation === "user-collection") {
      const newPath = affectedPaths.get(
        tab.value.document.saveContext?.folderPath
      )!
      tab.value.document.saveContext.folderPath = newPath
    }

    if (
      tab.value.document.saveContext?.originLocation !==
      "workspace-user-collection"
    ) {
      return false
    }

    const requestHandleRef = tab.value.document.saveContext.requestHandle?.get()

    if (!requestHandleRef || requestHandleRef.value.type === "invalid") {
      return false
    }

    const { requestID } = requestHandleRef.value.data

    const collectionID = requestID.split("/").slice(0, -1).join("/")

    const newCollectionID = affectedPaths.get(collectionID)
    const newRequestID = `${newCollectionID}/${
      requestID.split("/").slice(-1)[0]
    }`

    requestHandleRef.value.data = {
      ...requestHandleRef.value.data,
      collectionID: newCollectionID!,
      requestID: newRequestID,
    }
  }
}

/**
 * Resolve save context for affected requests on drop folder from one  to another
 * @param oldFolderPath
 * @param newFolderPath
 * @returns
 */

export function updateSaveContextForAffectedRequests(
  draggedCollectionIndex: string,
  destinationCollectionIndex: string
) {
  const tabService = getService(RESTTabService)

  const activeTabs = tabService.getActiveTabs()

  for (const tab of activeTabs.value) {
    if (tab.document.saveContext?.originLocation === "user-collection") {
      const { folderPath } = tab.document.saveContext

      if (folderPath.startsWith(draggedCollectionIndex)) {
        const newFolderPath = folderPath.replace(
          draggedCollectionIndex,
          destinationCollectionIndex
        )

        tab.document.saveContext = {
          ...tab.document.saveContext,
          folderPath: newFolderPath,
        }
      }

      return
    }

    if (
      tab.document.saveContext?.originLocation === "workspace-user-collection"
    ) {
      const requestHandleRef = tab.document.saveContext.requestHandle?.get()

      if (!requestHandleRef || requestHandleRef.value.type === "invalid") {
        return false
      }

      const { requestID } = requestHandleRef.value.data

      const collectionID = requestID.split("/").slice(0, -1).join("/")
      const requestIndex = requestID.split("/").slice(-1)[0]

      if (collectionID.startsWith(draggedCollectionIndex)) {
        const newCollectionID = collectionID.replace(
          draggedCollectionIndex,
          destinationCollectionIndex
        )
        const newRequestID = `${newCollectionID}/${requestIndex}`

        tab.document.saveContext = {
          ...tab.document.saveContext,
          requestID: newRequestID,
        }

        requestHandleRef.value.data = {
          ...requestHandleRef.value.data,
          collectionID: newCollectionID,
          requestID: newRequestID,
        }
      }
    }
  }
}

/**
 * Used to check the new folder path is close to the save context folder path or not
 * @param folderPathCurrent The path saved as the inherited path in the inherited properties
 * @param newFolderPath The incomming path
 * @param saveContextPath The save context of the request
 * @returns The path which is close to saveContext.folderPath
 */
function folderPathCloseToSaveContext(
  folderPathCurrent: string | undefined,
  newFolderPath: string,
  saveContextPath: string
) {
  if (!folderPathCurrent) return newFolderPath

  const folderPathCurrentArray = folderPathCurrent.split("/")
  const newFolderPathArray = newFolderPath.split("/")
  const saveContextFolderPathArray = saveContextPath.split("/")

  const folderPathCurrentMatch = folderPathCurrentArray.filter(
    (folder, i) => folder === saveContextFolderPathArray[i]
  ).length

  const newFolderPathMatch = newFolderPathArray.filter(
    (folder, i) => folder === saveContextFolderPathArray[i]
  ).length

  return folderPathCurrentMatch > newFolderPathMatch
    ? folderPathCurrent
    : newFolderPath
}

function removeDuplicatesAndKeepLast(arr: HoppInheritedProperty["headers"]) {
  const keyMap: { [key: string]: number[] } = {} // Map to store array of indices for each key

  // Populate keyMap with the indices of each key
  arr.forEach((item, index) => {
    const key = item.inheritedHeader.key
    if (!(key in keyMap)) {
      keyMap[key] = []
    }
    keyMap[key].push(index)
  })

  // Create a new array containing only the last occurrence of each key
  const result = []
  for (const key in keyMap) {
    if (Object.prototype.hasOwnProperty.call(keyMap, key)) {
      const lastIndex = keyMap[key][keyMap[key].length - 1]
      result.push(arr[lastIndex])
    }
  }

  // Sort the result array based on the parentID
  result.sort((a, b) => a.parentID.localeCompare(b.parentID))
  return result
}

function getSaveContextCollectionID(
  saveContext: HoppRESTSaveContext | HoppGQLSaveContext | undefined
): string | undefined {
  if (!saveContext) {
    return
  }

  const { originLocation } = saveContext

  if (originLocation === "team-collection") {
    return saveContext.collectionID
  }

  if (originLocation === "user-collection") {
    return saveContext.folderPath
  }

  const requestHandleRef = saveContext.requestHandle?.get()

  if (!requestHandleRef || requestHandleRef.value.type === "invalid") {
    return
  }

  // TODO: Remove `collectionID` and obtain it from `requestID`
  return requestHandleRef.value.data.collectionID
}

export function updateInheritedPropertiesForAffectedRequests(
  path: string,
  inheritedProperties: HoppInheritedProperty,
  type: "rest" | "graphql"
) {
  const tabService =
    type === "rest" ? getService(RESTTabService) : getService(GQLTabService)

  const effectedTabs = tabService.getTabsRefTo((tab) => {
    const saveContext = tab.document.saveContext

    const collectionID = getSaveContextCollectionID(saveContext)
    return collectionID?.startsWith(path) ?? false
  })

  effectedTabs.map((tab) => {
    const inheritedParentID =
      tab.value.document.inheritedProperties?.auth.parentID

    const contextPath = getSaveContextCollectionID(
      tab.value.document.saveContext
    )

    const effectedPath = folderPathCloseToSaveContext(
      inheritedParentID,
      path,
      contextPath ?? ""
    )

    if (effectedPath === path) {
      if (tab.value.document.inheritedProperties) {
        tab.value.document.inheritedProperties.auth = inheritedProperties.auth
      }
    }

    if (tab.value.document.inheritedProperties?.headers) {
      // filter out the headers with the parentID not as the path
      const headers = tab.value.document.inheritedProperties.headers.filter(
        (header) => header.parentID !== path
      )

      // filter out the headers with the parentID as the path in the inheritedProperties
      const inheritedHeaders = inheritedProperties.headers.filter(
        (header) => header.parentID === path
      )

      // merge the headers with the parentID as the path
      const mergedHeaders = removeDuplicatesAndKeepLast([
        ...new Set([...inheritedHeaders, ...headers]),
      ])

      tab.value.document.inheritedProperties.headers = mergedHeaders
    }
  })
}

/**
 * Reset save context to null if requests are deleted from the team collection or its folder
 * only runs when collection or folder is deleted
 */

export async function resetTeamRequestsContext() {
  const tabService = getService(RESTTabService)
  const tabs = tabService.getTabsRefTo((tab) => {
    return tab.document.saveContext?.originLocation === "team-collection"
  })

  for (const tab of tabs) {
    if (tab.value.document.saveContext?.originLocation === "team-collection") {
      const data = await runGQLQuery({
        query: GetSingleRequestDocument,
        variables: {
          requestID: tab.value.document.saveContext?.requestID,
        },
      })

      if (E.isRight(data) && data.right.request === null) {
        tab.value.document.saveContext = null
        tab.value.document.isDirty = true
      }
    }
  }
}

export function getFoldersByPath(
  collections: HoppCollection[],
  path: string
): HoppCollection[] {
  if (!path) return collections

  // path will be like this "0/0/1" these are the indexes of the folders
  const pathArray = path.split("/").map((index) => parseInt(index))

  let currentCollection = collections[pathArray[0]]

  if (pathArray.length === 1) {
    return currentCollection.folders
  }
  for (let i = 1; i < pathArray.length; i++) {
    const folder = currentCollection.folders[pathArray[i]]
    if (folder) currentCollection = folder
  }

  return currentCollection.folders
}
