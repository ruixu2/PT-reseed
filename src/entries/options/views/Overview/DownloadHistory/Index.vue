<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { onMounted, ref, shallowRef, computed } from "vue";
import { useDisplay, type DataTableHeader } from "vuetify";

import { sendMessage } from "@/messages.ts";
import { formatDate, formatSize } from "@/options/utils.ts";
import { useConfigStore } from "@/options/stores/config.ts";
import type { ITorrentDownloadMetadata, TTorrentDownloadKey, TTorrentDownloadStatus } from "@/shared/types.ts";

import SiteFavicon from "@/options/components/SiteFavicon/Index.vue";
import SiteName from "@/options/components/SiteName.vue";
import TorrentTitleTd from "@/options/components/TorrentTitleTd.vue";
import DeleteDialog from "@/options/components/DeleteDialog.vue";
import DownloaderLabel from "@/options/components/DownloaderLabel.vue";
import NavButton from "@/options/components/NavButton.vue";
import ReDownloadSelectDialog from "./ReDownloadSelectDialog.vue";
import AdvanceFilterGenerateDialog from "./AdvanceFilterGenerateDialog.vue";

import {
  downloadHistory,
  downloadHistoryList,
  downloadStatusMap,
  tableCustomFilter,
  throttleLoadDownloadHistory,
} from "./utils.ts";

const { t } = useI18n();
const configStore = useConfigStore();
const display = useDisplay();

const { tableFilterRef, tableWaitFilterRef, tableFilterFn } = tableCustomFilter;

const statusFilter = ref<TTorrentDownloadStatus[]>([]);
const statusOptions: TTorrentDownloadStatus[] = ["pending", "downloading", "completed", "failed"];

const filteredHistoryList = computed(() => {
  const list = downloadHistoryList.value;
  if (statusFilter.value.length === 0) return list;
  return list.filter((item) => statusFilter.value.includes(item.downloadStatus));
});

const tableHeader = computed(
  () =>
    [
      { title: t("common.site"), key: "siteId", align: "center" },
      {
        title: t("DownloadHistory.table.title"),
        key: "title",
        align: "start",
        minWidth: "30rem",
        ...(display.smAndDown.value ? { maxWidth: "32vw" } : {}),
      },
      { title: t("DownloadHistory.table.downloader"), key: "downloaderId", width: "11%", align: "start" },
      { title: t("DownloadHistory.table.downloadAt"), key: "downloadAt", align: "center" },
      { title: t("DownloadHistory.table.status"), key: "downloadStatus" },
      { title: t("common.action"), key: "action", align: "center", sortable: false },
    ] as DataTableHeader[],
);
const tableSelected = ref<TTorrentDownloadKey[]>([]);

const showAdvanceFilterDialog = ref<boolean>(false);

const showReDownloadSelectDialog = ref<boolean>(false);
const reDownloadTorrentListRef = shallowRef<ITorrentDownloadMetadata[]>([]);

function reDownloadTorrent(downloadHistoryIds: TTorrentDownloadKey[]) {
  const reDownloadTorrentList = [];
  for (const downloadHistoryId of downloadHistoryIds) {
    const history: ITorrentDownloadMetadata = downloadHistory.value[downloadHistoryId];
    if (history) {
      reDownloadTorrentList.push(history);
    }
  }
  reDownloadTorrentListRef.value = reDownloadTorrentList;
  showReDownloadSelectDialog.value = true;
}

const showDeleteDialog = ref<boolean>(false);
const toDeleteIds = ref<TTorrentDownloadKey[]>([]);

async function deleteDownloadHistory(downloadHistoryIds: TTorrentDownloadKey[]) {
  toDeleteIds.value = downloadHistoryIds;
  showDeleteDialog.value = true;
}

async function confirmDeleteDownloadHistory(downloadHistoryId: TTorrentDownloadKey) {
  return await sendMessage("deleteDownloadHistoryById", downloadHistoryId);
}

const showDownloadDetailDialog = ref<boolean>(false);
const downloadDetail = ref<any>({});

function viewDownloadDetail(history: ITorrentDownloadMetadata) {
  downloadDetail.value = history;
  showDownloadDetailDialog.value = true;
}

onMounted(() => {
  throttleLoadDownloadHistory();
});
</script>

<template>
  <v-alert :title="t('route.Overview.DownloadHistory')" type="info" />
  <v-card>
    <v-card-title>
      <v-row class="ma-0">
        <!-- 按钮组 -->
        <NavButton
          color="green"
          icon="mdi-cached"
          :text="t('DownloadHistory.refresh')"
          @click="() => throttleLoadDownloadHistory()"
        />

        <v-divider vertical class="mx-2" />

        <NavButton
          :disabled="tableSelected.length === 0"
          color="primary"
          icon="mdi-tray-arrow-down"
          :text="t('DownloadHistory.reDownload')"
          @click="() => reDownloadTorrent(tableSelected)"
        />

        <NavButton
          :disabled="tableSelected.length === 0"
          :text="t('common.remove')"
          color="error"
          icon="mdi-minus"
          @click="deleteDownloadHistory(tableSelected)"
        />

        <v-spacer />

        <!-- 筛选框 -->
        <v-select
          v-model="statusFilter"
          :items="statusOptions"
          :item-title="(s) => t(`TorrentDownloadStatus.${s}`)"
          :label="t('common.status')"
          density="compact"
          variant="outlined"
          hide-details
          multiple
          clearable
          chips
          max-visible-chips="2"
          style="max-width: 280px"
          class="mr-2"
        />
        <v-text-field
          v-model="tableWaitFilterRef"
          append-icon="mdi-magnify"
          clearable
          density="compact"
          hide-details
          :label="t('DownloadHistory.filterPlaceholder')"
          max-width="500"
          prepend-inner-icon="mdi-filter"
          single-line
          @click:prepend-inner="showAdvanceFilterDialog = true"
        />
      </v-row>
    </v-card-title>
    <v-card-text>
      <v-data-table
        v-model="tableSelected"
        :custom-filter="tableFilterFn"
        :filter-keys="['id']"
        :headers="tableHeader"
        :items="filteredHistoryList"
        :items-per-page="configStore.tableBehavior.DownloadHistory.itemsPerPage"
        :multi-sort="configStore.enableTableMultiSort"
        :search="tableFilterRef"
        :sort-by="configStore.tableBehavior.DownloadHistory.sortBy"
        class="table-stripe table-header-no-wrap"
        hover
        item-value="id"
        show-select
        @update:itemsPerPage="(v) => configStore.updateTableBehavior('DownloadHistory', 'itemsPerPage', v)"
        @update:sortBy="(v) => configStore.updateTableBehavior('DownloadHistory', 'sortBy', v)"
      >
        <template #item.siteId="{ item }">
          <div class="d-flex flex-column align-center">
            <SiteFavicon :site-id="item.siteId" :size="18" />
            <SiteName :site-id="item.siteId" />
          </div>
        </template>

        <template #item.title="{ item }">
          <TorrentTitleTd v-if="item.torrent" :item="item.torrent" />
        </template>

        <template #item.downloaderId="{ item }">
          <DownloaderLabel :downloader="item.downloaderId" />
        </template>

        <template #item.downloadAt="{ item }">
          <span class="t_downloadAt text-no-wrap">{{ formatDate(item.downloadAt ?? 0) }}</span>
        </template>

        <template #item.downloadStatus="{ item }">
          <v-chip
            :prepend-icon="downloadStatusMap[item.downloadStatus].icon"
            :color="downloadStatusMap[item.downloadStatus].color"
            @click="() => viewDownloadDetail(item)"
          >
            {{ downloadStatusMap[item.downloadStatus].title }}
          </v-chip>
        </template>

        <template #item.action="{ item }">
          <v-btn-group class="table-action" density="compact" variant="plain">
            <v-btn
              :title="t('DownloadHistory.reDownload')"
              color="primary"
              icon="mdi-tray-arrow-down"
              size="small"
              @click="() => reDownloadTorrent([item.id!])"
            />

            <v-btn
              :title="t('common.remove')"
              color="error"
              icon="mdi-delete"
              size="small"
              @click="() => deleteDownloadHistory([item.id!])"
            />
          </v-btn-group>
        </template>
      </v-data-table>
    </v-card-text>
  </v-card>

  <ReDownloadSelectDialog
    v-model="showReDownloadSelectDialog"
    :torrent-items="reDownloadTorrentListRef"
    @re-download-complete="() => throttleLoadDownloadHistory()"
  />

  <AdvanceFilterGenerateDialog v-model="showAdvanceFilterDialog" />

  <DeleteDialog
    v-model="showDeleteDialog"
    :to-delete-ids="toDeleteIds"
    :confirm-delete="confirmDeleteDownloadHistory"
    @all-delete="() => throttleLoadDownloadHistory()"
  />

  <v-dialog v-model="showDownloadDetailDialog" max-width="700">
    <v-card v-if="downloadDetail.id != null">
      <v-card-title class="d-flex align-center text-subtitle-1">
        <v-icon class="mr-2">mdi-information-outline</v-icon>
        {{ t("DownloadHistory.detail.title") }}
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" size="small" @click="showDownloadDetailDialog = false"></v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <v-list density="compact" class="pa-0">
          <v-list-item>
            <template #prepend><v-icon class="mr-3">mdi-web</v-icon></template>
            <v-list-item-title class="text-caption text-grey">{{ t("common.site") }}</v-list-item-title>
            <v-list-item-subtitle class="d-flex align-center">
              <SiteFavicon :site-id="downloadDetail.siteId" :size="16" class="mr-1" />
              <SiteName :site-id="downloadDetail.siteId" />
            </v-list-item-subtitle>
          </v-list-item>
          <v-divider></v-divider>
          <v-list-item>
            <template #prepend><v-icon class="mr-3">mdi-label</v-icon></template>
            <v-list-item-title class="text-caption text-grey">{{ t("DownloadHistory.table.title") }}</v-list-item-title>
            <v-list-item-subtitle class="text-body-2">{{ downloadDetail.title || "-" }}</v-list-item-subtitle>
          </v-list-item>
          <v-divider></v-divider>
          <v-list-item>
            <template #prepend><v-icon class="mr-3">mdi-server</v-icon></template>
            <v-list-item-title class="text-caption text-grey">{{
              t("DownloadHistory.table.downloader")
            }}</v-list-item-title>
            <v-list-item-subtitle>
              <DownloaderLabel :downloader="downloadDetail.downloaderId" />
            </v-list-item-subtitle>
          </v-list-item>
          <v-divider></v-divider>
          <v-list-item>
            <template #prepend><v-icon class="mr-3">mdi-calendar</v-icon></template>
            <v-list-item-title class="text-caption text-grey">{{
              t("DownloadHistory.table.downloadAt")
            }}</v-list-item-title>
            <v-list-item-subtitle>{{ formatDate(downloadDetail.downloadAt ?? 0) }}</v-list-item-subtitle>
          </v-list-item>
          <v-divider></v-divider>
          <v-list-item>
            <template #prepend><v-icon class="mr-3">mdi-information</v-icon></template>
            <v-list-item-title class="text-caption text-grey">{{
              t("DownloadHistory.table.status")
            }}</v-list-item-title>
            <v-list-item-subtitle>
              <v-chip
                :prepend-icon="downloadStatusMap[downloadDetail.downloadStatus as TTorrentDownloadStatus]?.icon"
                :color="downloadStatusMap[downloadDetail.downloadStatus as TTorrentDownloadStatus]?.color"
                size="x-small"
                label
              >
                {{ downloadStatusMap[downloadDetail.downloadStatus as TTorrentDownloadStatus]?.title }}
              </v-chip>
            </v-list-item-subtitle>
          </v-list-item>
          <v-divider v-if="downloadDetail.torrent?.size"></v-divider>
          <v-list-item v-if="downloadDetail.torrent?.size">
            <template #prepend><v-icon class="mr-3">mdi-harddisk</v-icon></template>
            <v-list-item-title class="text-caption text-grey">{{ t("common.size") }}</v-list-item-title>
            <v-list-item-subtitle>{{ formatSize(downloadDetail.torrent.size) }}</v-list-item-subtitle>
          </v-list-item>
          <v-divider v-if="downloadDetail.addTorrentOptions?.savePath"></v-divider>
          <v-list-item v-if="downloadDetail.addTorrentOptions?.savePath">
            <template #prepend><v-icon class="mr-3">mdi-folder-open</v-icon></template>
            <v-list-item-title class="text-caption text-grey">{{
              t("DownloadHistory.detail.savePath")
            }}</v-list-item-title>
            <v-list-item-subtitle class="text-caption">{{
              downloadDetail.addTorrentOptions.savePath
            }}</v-list-item-subtitle>
          </v-list-item>
          <v-divider v-if="downloadDetail.addTorrentResult?.success != null"></v-divider>
          <v-list-item v-if="downloadDetail.addTorrentResult?.success != null">
            <template #prepend><v-icon class="mr-3">mdi-check-circle</v-icon></template>
            <v-list-item-title class="text-caption text-grey">{{
              t("DownloadHistory.detail.addResult")
            }}</v-list-item-title>
            <v-list-item-subtitle>
              <v-icon :color="downloadDetail.addTorrentResult.success ? 'success' : 'error'" size="small" class="mr-1">
                {{ downloadDetail.addTorrentResult.success ? "mdi-check" : "mdi-close" }}
              </v-icon>
              {{ downloadDetail.addTorrentResult.success ? t("common.success") : t("common.fail") }}
            </v-list-item-subtitle>
          </v-list-item>
          <v-divider v-if="downloadDetail.addTorrentResult?.message"></v-divider>
          <v-list-item v-if="downloadDetail.addTorrentResult?.message">
            <template #prepend><v-icon class="mr-3">mdi-message-text</v-icon></template>
            <v-list-item-title class="text-caption text-grey">{{
              t("DownloadHistory.detail.resultMsg")
            }}</v-list-item-title>
            <v-list-item-subtitle class="text-caption">{{
              downloadDetail.addTorrentResult.message
            }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="showDownloadDetailDialog = false">{{ t("common.close") }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss"></style>
