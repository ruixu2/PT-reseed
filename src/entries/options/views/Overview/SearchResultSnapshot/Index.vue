<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { refDebounced } from "@vueuse/core";
import type { DataTableHeader } from "vuetify";

import { formatDate, formatSize } from "@/options/utils.ts";
import { sendMessage } from "@/messages.ts";
import { useMetadataStore } from "@/options/stores/metadata.ts";
import { useConfigStore } from "@/options/stores/config.ts";
import { type TSearchSnapshotKey } from "@/shared/types.ts";
import type { ISearchPlanStatus } from "@/shared/types.ts";
import SiteFavicon from "@/options/components/SiteFavicon/Index.vue";

import DeleteDialog from "@/options/components/DeleteDialog.vue";
import NavButton from "@/options/components/NavButton.vue";
import EditNameDialog from "./EditNameDialog.vue";

const { t } = useI18n();
const router = useRouter();
const configStore = useConfigStore();
const metadataStore = useMetadataStore();

const showEditNameDialog = ref<boolean>(false);
const showDeleteDialog = ref<boolean>(false);

const tableHeader = [
  { title: t("SearchResultSnapshot.table.header.name"), key: "name", align: "start" },
  { title: t("SearchResultSnapshot.table.header.recordCount"), key: "recordCount", align: "end", width: 100 },
  {
    title: t("SearchResultSnapshot.table.header.createdAt"),
    key: "createdAt",
    align: "center",
    width: 150,
    minWidth: 150,
  },
  {
    title: t("common.action"),
    key: "action",
    align: "center",
    width: 155,
    minWidth: 155,
    sortable: false,
    alwaysShow: true,
  },
] as DataTableHeader[];
const tableSelected = ref<TSearchSnapshotKey[]>([]);
const tableWaitFilter = ref("");
const tableFilter = refDebounced(tableWaitFilter, 500);

function viewSnapshot(searchSnapshotId: TSearchSnapshotKey) {
  router.push({
    name: "SearchEntity",
    query: {
      snapshot: searchSnapshotId,
    },
  });
}

const toEditId = ref<TSearchSnapshotKey | null>(null);
function editSnapshotName(searchSnapshotId: TSearchSnapshotKey) {
  toEditId.value = searchSnapshotId;
  showEditNameDialog.value = true;
}

const toDeleteIds = ref<TSearchSnapshotKey[]>([]);
function tryToDeleteSearchSnapshot(searchSnapshotId: TSearchSnapshotKey[]) {
  toDeleteIds.value = searchSnapshotId;
  showDeleteDialog.value = true;
}

async function confirmDeleteSearchSnapshot(searchSnapshotId: TSearchSnapshotKey) {
  return await metadataStore.removeSearchSnapshotData(searchSnapshotId);
}

// --- Detail Dialog ---
const showDetailDialog = ref(false);
const detailLoading = ref(false);
const detailData = ref<any>(null);
const detailId = ref<TSearchSnapshotKey | null>(null);

const detailSiteResults = ref<Array<{ siteId: string; count: number; status: any }>>([]);
const detailPreviewResults = ref<any[]>([]);
const detailStats = ref({
  totalSites: 0,
  matchedSites: 0,
  totalResults: 0,
  searchKey: "",
  searchPlanKey: "",
  costTime: 0,
});

async function openDetail(id: TSearchSnapshotKey) {
  detailId.value = id;
  showDetailDialog.value = true;
  detailLoading.value = true;
  try {
    const data = await sendMessage("getSearchResultSnapshotData", id);
    detailData.value = data;
    if (data) {
      const searchPlan = data.searchPlan || {};
      const planEntries = Object.values(searchPlan) as ISearchPlanStatus[];
      const matched = planEntries.filter((p) => (p.count ?? 0) > 0);
      detailSiteResults.value = planEntries.map((p) => ({
        siteId: p.siteId,
        count: p.count ?? 0,
        status: p.status,
      }));
      detailPreviewResults.value = (data.searchResult || []).slice(0, 20);
      detailStats.value = {
        totalSites: planEntries.length,
        matchedSites: matched.length,
        totalResults: data.searchResult?.length ?? 0,
        searchKey: data.searchKey || "",
        searchPlanKey: data.searchPlanKey || "",
        costTime: data.endAt && data.startAt ? Math.round((data.endAt - data.startAt) / 1000) : 0,
      };
    }
  } catch (e) {
    console.error("Failed to load snapshot detail", e);
  } finally {
    detailLoading.value = false;
  }
}
</script>

<template>
  <v-alert type="info" :title="t('route.Overview.SearchResultSnapshot')" />
  <v-card>
    <v-card-title>
      <v-row class="ma-0">
        <NavButton
          :disabled="tableSelected.length === 0"
          color="error"
          icon="mdi-minus"
          :text="t('common.remove')"
          @click="tryToDeleteSearchSnapshot(tableSelected)"
        />
        <v-spacer />
        <v-text-field
          v-model="tableWaitFilter"
          append-icon="mdi-magnify"
          clearable
          density="compact"
          hide-details
          :label="t('SearchResultSnapshot.table.filterLabel')"
          max-width="500"
          single-line
        />
      </v-row>
    </v-card-title>

    <v-data-table
      v-model="tableSelected"
      :headers="tableHeader"
      :items="metadataStore.getSearchSnapshotList"
      :items-per-page="configStore.tableBehavior.SearchResultSnapshot.itemsPerPage"
      :search="tableFilter"
      :sort-by="configStore.tableBehavior.SearchResultSnapshot.sortBy"
      class="table-stripe table-header-no-wrap"
      hover
      item-value="id"
      :multi-sort="configStore.enableTableMultiSort"
      show-select
      @update:itemsPerPage="(v) => configStore.updateTableBehavior('SearchResultSnapshot', 'itemsPerPage', v)"
      @update:sortBy="(v) => configStore.updateTableBehavior('SearchResultSnapshot', 'sortBy', v)"
    >
      <template #item.createdAt="{ item }">
        <span class="text-no-wrap"> {{ formatDate(item.createdAt) }}</span>
      </template>
      <template #item.action="{ item }">
        <v-btn-group class="table-action" density="compact" variant="plain">
          <v-btn
            color="green"
            icon="mdi-archive-search"
            size="small"
            :title="t('SearchResultSnapshot.table.action.view')"
            @click="() => viewSnapshot(item.id)"
          ></v-btn>
          <v-btn
            color="info"
            icon="mdi-information-outline"
            size="small"
            :title="t('SearchResultSnapshot.table.action.detail')"
            @click="() => openDetail(item.id)"
          ></v-btn>
          <v-btn
            color="blue"
            icon="mdi-archive-edit"
            size="small"
            :title="t('SearchResultSnapshot.table.action.editTitle')"
            @click="() => editSnapshotName(item.id)"
          ></v-btn>
          <v-btn
            :title="t('common.remove')"
            color="error"
            icon="mdi-delete"
            size="small"
            @click="tryToDeleteSearchSnapshot([item.id])"
          >
          </v-btn>
        </v-btn-group>
      </template>
    </v-data-table>
  </v-card>

  <!-- Detail Dialog -->
  <v-dialog v-model="showDetailDialog" max-width="900" scrollable>
    <v-card :loading="detailLoading">
      <v-card-title class="d-flex align-center text-subtitle-1">
        <v-icon class="mr-2">mdi-information-outline</v-icon>
        {{ t("SearchResultSnapshot.detail.title") }}
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="showDetailDialog = false"></v-btn>
      </v-card-title>

      <v-card-text v-if="detailData">
        <!-- Search Info -->
        <v-row class="mb-4">
          <v-col cols="12" sm="6" md="3">
            <v-card color="indigo-lighten-5" variant="flat" class="text-center pa-3">
              <div class="text-caption text-indigo-darken-2 font-weight-bold">
                {{ t("SearchResultSnapshot.detail.sites") }}
              </div>
              <div class="text-h5 text-indigo-darken-4 mt-1">{{ detailStats.totalSites }}</div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card color="green-lighten-5" variant="flat" class="text-center pa-3">
              <div class="text-caption text-green-darken-2 font-weight-bold">
                {{ t("SearchResultSnapshot.detail.matchedSites") }}
              </div>
              <div class="text-h5 text-green-darken-4 mt-1">{{ detailStats.matchedSites }}</div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card color="blue-lighten-5" variant="flat" class="text-center pa-3">
              <div class="text-caption text-blue-darken-2 font-weight-bold">
                {{ t("SearchResultSnapshot.detail.totalResults") }}
              </div>
              <div class="text-h5 text-blue-darken-4 mt-1">{{ detailStats.totalResults }}</div>
            </v-card>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-card color="orange-lighten-5" variant="flat" class="text-center pa-3">
              <div class="text-caption text-orange-darken-2 font-weight-bold">
                {{ t("SearchResultSnapshot.detail.costTime") }}
              </div>
              <div class="text-h5 text-orange-darken-4 mt-1">{{ detailStats.costTime }}s</div>
            </v-card>
          </v-col>
        </v-row>

        <!-- Search Details -->
        <v-card variant="outlined" class="mb-4">
          <v-list density="compact" class="pa-0">
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-magnify</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("SearchResultSnapshot.detail.searchKey")
              }}</v-list-item-title>
              <v-list-item-subtitle class="text-body-2">{{ detailStats.searchKey || "-" }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-widgets</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("SearchResultSnapshot.detail.searchPlan")
              }}</v-list-item-title>
              <v-list-item-subtitle class="text-body-2">{{ detailStats.searchPlanKey || "-" }}</v-list-item-subtitle>
            </v-list-item>
            <v-divider></v-divider>
            <v-list-item>
              <template #prepend><v-icon class="mr-3">mdi-calendar</v-icon></template>
              <v-list-item-title class="text-caption text-grey">{{
                t("SearchResultSnapshot.detail.createdAt")
              }}</v-list-item-title>
              <v-list-item-subtitle class="text-body-2">{{ formatDate(detailData.startAt) }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card>

        <!-- Per-Site Results -->
        <v-card variant="outlined" class="mb-4">
          <v-card-title class="text-subtitle-2 pb-1">
            {{ t("SearchResultSnapshot.detail.siteDistribution") }}
          </v-card-title>
          <v-data-table
            :headers="[
              { title: t('common.site'), key: 'siteId', align: 'start' as const },
              { title: t('SearchResultSnapshot.detail.resultCount'), key: 'count', align: 'end' as const },
              { title: t('SearchResultSnapshot.detail.status'), key: 'status', align: 'center' as const },
            ]"
            :items="detailSiteResults"
            item-value="siteId"
            density="compact"
            class="elevation-0"
            hide-default-footer
            hover
          >
            <template #item.siteId="{ item }">
              <div class="d-flex align-center">
                <SiteFavicon :site-id="item.siteId" :size="16" class="mr-2" />
                <span class="text-caption font-weight-medium">{{ item.siteId }}</span>
              </div>
            </template>
            <template #item.count="{ item }">
              <span :class="item.count > 0 ? 'font-weight-bold' : 'text-grey'">{{ item.count }}</span>
            </template>
            <template #item.status="{ item }">
              <v-chip
                :color="item.status === 'success' ? 'success' : item.status === 'error' ? 'error' : 'grey'"
                size="x-small"
                label
                variant="flat"
              >
                {{ item.status }}
              </v-chip>
            </template>
            <template #no-data>
              <div class="pa-2 text-center text-caption text-grey">
                {{ t("SearchResultSnapshot.detail.noSiteData") }}
              </div>
            </template>
          </v-data-table>
        </v-card>

        <!-- Result Preview -->
        <v-card variant="outlined" v-if="detailPreviewResults.length > 0">
          <v-card-title class="text-subtitle-2 pb-1 d-flex align-center">
            {{ t("SearchResultSnapshot.detail.resultPreview") }}
            <v-spacer></v-spacer>
            <span class="text-caption text-grey font-weight-regular">
              {{
                t("SearchResultSnapshot.detail.showingCount", {
                  count: detailPreviewResults.length,
                  total: detailStats.totalResults,
                })
              }}
            </span>
          </v-card-title>
          <v-data-table
            :headers="[
              { title: t('common.site'), key: 'site', align: 'start' as const },
              { title: t('common.title'), key: 'title', align: 'start' as const },
              { title: t('common.size'), key: 'size', align: 'end' as const },
              { title: t('common.seeders'), key: 'seeders', align: 'center' as const },
              { title: t('common.leechers'), key: 'leechers', align: 'center' as const },
            ]"
            :items="detailPreviewResults"
            item-value="uniqueId"
            density="compact"
            class="elevation-0"
            hide-default-footer
            hover
          >
            <template #item.site="{ item }">
              <div class="d-flex align-center">
                <SiteFavicon :site-id="item.site" :size="16" class="mr-2" />
                <span class="text-caption">{{ item.site }}</span>
              </div>
            </template>
            <template #item.title="{ item }">
              <div class="text-body-2 text-truncate" style="max-width: 350px">{{ item.title }}</div>
            </template>
            <template #item.size="{ item }">
              <span class="text-caption text-no-wrap">{{ formatSize(item.size) }}</span>
            </template>
            <template #item.seeders="{ item }">
              <span class="text-caption">{{ (item.seeders ?? -1) >= 0 ? item.seeders : "-" }}</span>
            </template>
            <template #item.leechers="{ item }">
              <span class="text-caption">{{ (item.leechers ?? -1) >= 0 ? item.leechers : "-" }}</span>
            </template>
          </v-data-table>
        </v-card>
      </v-card-text>

      <v-card-text v-else-if="!detailLoading" class="text-center pa-8 text-grey">
        <v-icon icon="mdi-inbox-outline" size="64" class="mb-4"></v-icon>
        <div class="text-body-1">{{ t("SearchResultSnapshot.detail.noData") }}</div>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="showDetailDialog = false">{{ t("common.close") }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <EditNameDialog v-model="showEditNameDialog" :edit-id="toEditId!" />
  <DeleteDialog v-model="showDeleteDialog" :to-delete-ids="toDeleteIds" :confirm-delete="confirmDeleteSearchSnapshot" />
</template>

<style scoped lang="scss"></style>
