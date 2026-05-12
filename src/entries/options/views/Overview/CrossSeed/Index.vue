<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useI18n } from "vue-i18n";

import { sendMessage } from "@/messages.ts";
import { formatSize } from "@/options/utils.ts";
import { useRuntimeStore } from "@/options/stores/runtime.ts";

import SiteFavicon from "@/options/components/SiteFavicon/Index.vue";
import SearchResultDialog from "./SearchResultDialog.vue";
import QueueList from "./QueueList.vue";
import StagingArea from "./StagingArea.vue";

const { t } = useI18n();
const runtimeStore = useRuntimeStore();

const tab = ref("analysis");
const loading = ref(false);
const downloaders = ref<any[]>([]);
const selectedDownloader = ref<string | null>(null);
const duplicates = ref<any[][]>([]);
const expanded = ref<number[]>([]);
const tableSelected = ref<any[]>([]);

const showSearchResultDialog = ref(false);
const searchResults = ref<any[]>([]);
const currentSourceTorrent = ref<any>(null);

const headers = [
  { title: t("CrossSeed.table.groupName"), key: "name", align: "start" as const },
  { title: t("common.site"), key: "sites", align: "start" as const, sortable: false },
  { title: t("CrossSeed.table.size"), key: "totalSize", align: "end" as const },
  { title: t("CrossSeed.table.count"), key: "count", align: "center" as const },
  { title: t("common.action"), key: "action", align: "center" as const, sortable: false },
];

async function loadDownloaders() {
  downloaders.value = (await sendMessage("getDownloaderList", undefined)) as any[];
  if (downloaders.value.length > 0 && !selectedDownloader.value) {
    selectedDownloader.value = downloaders.value[0].id;
  }
}

async function scanDownloader() {
  if (!selectedDownloader.value) return;
  loading.value = true;
  try {
    await sendMessage("scanDownloaderForCrossSeed", selectedDownloader.value);
    duplicates.value = await sendMessage("analyzeDuplicateTorrents", undefined);
    runtimeStore.showSnakebar(t("CrossSeed.scanSuccess"), { color: "success" });
  } catch (e) {
    console.error("Scan failed:", e);
    runtimeStore.showSnakebar(t("CrossSeed.scanError"), { color: "error" });
  } finally {
    loading.value = false;
  }
}

async function searchOnSites(group: any[]) {
  const infoHash = group[0].infoHash;
  currentSourceTorrent.value = group[0];
  loading.value = true;
  try {
    const results = (await sendMessage("searchTorrentOnAllSites", infoHash)) as any[];
    if (results.length > 0) {
      searchResults.value = results;
      showSearchResultDialog.value = true;
    } else {
      runtimeStore.showSnakebar(t("CrossSeed.searchNotFound"), { color: "info" });
    }
  } catch (e) {
    runtimeStore.showSnakebar(t("CrossSeed.searchError"), { color: "error" });
  } finally {
    loading.value = false;
  }
}

async function addToQueue() {
  if (tableSelected.value.length === 0) return;

  const torrentsToAdd = tableSelected.value.map((item) => item.items[0]);
  loading.value = true;
  try {
    await sendMessage("addTorrentsToReseedQueue", torrentsToAdd);
    runtimeStore.showSnakebar(t("CrossSeed.addQueueSuccess", { count: torrentsToAdd.length }), { color: "success" });
    tableSelected.value = [];
    tab.value = "queue";
  } catch (e) {
    runtimeStore.showSnakebar(t("CrossSeed.addQueueError"), { color: "error" });
  } finally {
    loading.value = false;
  }
}

const displayDuplicates = computed(() => {
  return duplicates.value.map((group, index) => {
    // 提取组内所有唯一的站点
    const sites = [...new Set(group.map((item) => item.originSite).filter(Boolean))];
    return {
      id: index,
      name: group[0].name,
      totalSize: group[0].totalSize,
      count: group.length,
      sites,
      items: group,
    };
  });
});

onMounted(async () => {
  await loadDownloaders();
  duplicates.value = await sendMessage("analyzeDuplicateTorrents", undefined);
});
</script>

<template>
  <v-container fluid>
    <v-tabs v-model="tab" color="primary" density="compact" class="mb-4">
      <v-tab value="analysis" prepend-icon="mdi-google-analytics">
        {{ t("CrossSeed.tabs.analysis") }}
      </v-tab>
      <v-tab value="staging" prepend-icon="mdi-clipboard-check-outline">
        {{ t("CrossSeed.staging.title") }}
      </v-tab>
      <v-tab value="queue" prepend-icon="mdi-tray-full">
        {{ t("CrossSeed.tabs.queue") }}
      </v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item value="analysis">
        <v-alert type="info" class="mb-4" density="compact">
          {{ t("CrossSeed.intro") }}
        </v-alert>

        <v-card class="mb-4">
          <v-card-text>
            <v-row align="center">
              <v-col cols="12" sm="6" md="4">
                <v-select
                  v-model="selectedDownloader"
                  :items="downloaders"
                  item-title="name"
                  item-value="id"
                  :label="t('CrossSeed.selectDownloader')"
                  hide-details
                  density="compact"
                ></v-select>
              </v-col>
              <v-col cols="auto">
                <v-btn color="primary" :loading="loading" :disabled="!selectedDownloader" @click="scanDownloader">
                  <v-icon start>mdi-magnify-scan</v-icon>
                  {{ t("CrossSeed.startScan") }}
                </v-btn>
              </v-col>
              <v-spacer></v-spacer>
              <v-col cols="auto">
                <v-btn color="secondary" variant="elevated" :disabled="tableSelected.length === 0" @click="addToQueue">
                  <v-icon start>mdi-plus-box-multiple</v-icon>
                  {{ t("CrossSeed.addToQueue") }}
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>

        <v-card>
          <v-card-title class="d-flex align-center py-2">
            {{ t("CrossSeed.analysisResult") }}
            <v-spacer></v-spacer>
            <span class="text-caption" v-if="duplicates.length > 0">
              {{ t("CrossSeed.duplicateGroups", { count: duplicates.length }) }}
            </span>
          </v-card-title>

          <v-data-table
            v-model="tableSelected"
            v-model:expanded="expanded"
            :headers="headers"
            :items="displayDuplicates"
            :loading="loading"
            item-value="id"
            show-expand
            show-select
            select-strategy="page"
            class="elevation-1"
          >
            <template #item.name="{ item }">
              <div class="text-truncate" style="max-width: 400px">
                {{ item.name }}
              </div>
            </template>

            <template #item.sites="{ item }">
              <div class="d-flex align-center">
                <SiteFavicon v-for="siteId in item.sites" :key="siteId" :site-id="siteId" size="18" class="mr-1" />
                <v-icon v-if="item.sites.length === 0" size="small" color="grey">mdi-help-circle-outline</v-icon>
              </div>
            </template>

            <template #item.totalSize="{ item }">
              {{ formatSize(item.totalSize) }}
            </template>

            <template #item.action="{ item }">
              <v-btn size="small" color="info" variant="text" @click="searchOnSites(item.items)">
                <v-icon start>mdi-earth</v-icon>
                {{ t("CrossSeed.searchOnSites") }}
              </v-btn>
            </template>

            <template #expanded-row="{ item }">
              <tr>
                <td :colspan="headers.length + 2" class="pa-0">
                  <v-list density="compact" bg-color="grey-lighten-4">
                    <v-list-item v-for="(subItem, index) in item.items" :key="index">
                      <template #prepend>
                        <SiteFavicon v-if="subItem.originSite" :site-id="subItem.originSite" size="20" class="mr-3" />
                        <v-icon v-else icon="mdi-file-check" color="success" size="small" class="mr-2"></v-icon>
                      </template>
                      <v-list-item-title class="text-body-2 d-flex align-center">
                        <span v-if="subItem.originSite" class="text-caption font-weight-bold mr-2"
                          >[{{ subItem.originSite }}]</span
                        >
                        {{ subItem.name }}
                      </v-list-item-title>
                      <v-list-item-subtitle class="text-caption">
                        Hash: {{ subItem.infoHash }} | Client: {{ subItem.clientId }} | Path: {{ subItem.savePath }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-list>
                </td>
              </tr>
            </template>

            <template #no-data>
              <div class="pa-4 text-center text-grey">
                {{ t("CrossSeed.noDuplicates") }}
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-window-item>

      <v-window-item value="staging">
        <StagingArea />
      </v-window-item>

      <v-window-item value="queue">
        <QueueList />
      </v-window-item>

      <v-window-item value="statistics">
        <Statistics />
      </v-window-item>
    </v-window>

    <SearchResultDialog
      v-model="showSearchResultDialog"
      :results="searchResults"
      :source-torrent="currentSourceTorrent"
    />
  </v-container>
</template>

<style scoped></style>
