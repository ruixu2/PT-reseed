<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { sendMessage } from "@/messages.ts";
import { formatSize } from "@/options/utils.ts";
import { useRuntimeStore } from "@/options/stores/runtime.ts";
import SiteFavicon from "@/options/components/SiteFavicon/Index.vue";

const props = defineProps<{
  modelValue: boolean;
  results: any[];
  sourceTorrent: any;
}>();

const emit = defineEmits(["update:modelValue"]);
const { t } = useI18n();
const runtimeStore = useRuntimeStore();

const loading = ref<Record<string, boolean>>({});
const targetDownloaderId = ref<string | null>(null);
const downloaders = ref<any[]>([]);

const headers = [
  { title: t("common.site"), key: "site", align: "start" as const },
  { title: t("common.title"), key: "title", align: "start" as const },
  { title: t("CrossSeed.table.matchLevel"), key: "matchLevel", align: "center" as const },
  { title: t("common.size"), key: "size", align: "end" as const },
  { title: t("common.action"), key: "action", align: "center" as const, sortable: false },
];

async function loadDownloaders() {
  downloaders.value = (await sendMessage("getDownloaderList", undefined)) as any[];
  if (downloaders.value.length > 0 && !targetDownloaderId.value) {
    targetDownloaderId.value = props.sourceTorrent?.clientId || downloaders.value[0].id;
  }
}

onMounted(loadDownloaders);
watch(
  () => props.sourceTorrent,
  () => {
    if (props.sourceTorrent) {
      targetDownloaderId.value = props.sourceTorrent.clientId;
    }
  },
  { immediate: true },
);

async function quickCrossSeed(torrent: any) {
  const source = props.sourceTorrent;
  if (!targetDownloaderId.value) return;

  loading.value[torrent.id] = true;
  try {
    const result: any = await sendMessage("downloadTorrent", {
      torrent,
      downloaderId: targetDownloaderId.value,
      options: {
        savePath: source.savePath,
        addAtPaused: true,
      },
    });
    if (result.success) {
      runtimeStore.showSnakebar(t("CrossSeed.sendSuccess"), { color: "success" });
    } else {
      runtimeStore.showSnakebar(t("CrossSeed.sendError"), { color: "error" });
    }
  } catch (e) {
    runtimeStore.showSnakebar(t("CrossSeed.sendError"), { color: "error" });
  } finally {
    loading.value[torrent.id] = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="960px"
    scrollable
  >
    <v-card>
      <v-card-title class="d-flex align-center flex-wrap">
        <span class="text-h6">{{ t("CrossSeed.searchResultTitle") }}</span>
        <v-divider vertical class="mx-4 d-none d-sm-flex"></v-divider>
        <div style="width: 240px" class="my-2">
          <v-select
            v-model="targetDownloaderId"
            :items="downloaders"
            item-title="name"
            item-value="id"
            :label="t('CrossSeed.targetDownloader')"
            hide-details
            density="compact"
            variant="outlined"
            prepend-inner-icon="mdi-download-network"
          ></v-select>
        </div>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" @click="emit('update:modelValue', false)"></v-btn>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text class="pa-0" style="height: 600px">
        <v-data-table :headers="headers" :items="results" class="elevation-0" density="compact">
          <template #item.site="{ item }">
            <div class="d-flex align-center">
              <SiteFavicon :site-id="item.site" size="18" class="mr-2" />
              <span class="text-caption font-weight-bold">{{ item.site }}</span>
            </div>
          </template>

          <template #item.title="{ item }">
            <div class="text-body-2 font-weight-medium">{{ item.title }}</div>
            <div class="text-caption text-grey text-truncate" style="max-width: 450px">{{ item.subTitle }}</div>
          </template>

          <template #item.matchLevel="{ item }">
            <v-tooltip location="top">
              <template v-slot:activator="{ props }">
                <v-chip
                  v-bind="props"
                  :color="item.matchLevel === 'L1' ? 'success' : 'orange'"
                  size="x-small"
                  label
                  variant="flat"
                >
                  {{ t(`CrossSeed.matchLevel.${item.matchLevel || "L1"}`) }}
                </v-chip>
              </template>
              <div class="text-caption" style="max-width: 200px">
                {{ item.matchLevel === "L1" ? t("CrossSeed.matchLevel.L1_desc") : t("CrossSeed.matchLevel.L2_desc") }}
              </div>
            </v-tooltip>
          </template>

          <template #item.size="{ item }">
            <span class="text-no-wrap">{{ formatSize(item.size) }}</span>
          </template>

          <template #item.action="{ item }">
            <v-btn
              size="x-small"
              color="success"
              variant="elevated"
              :loading="loading[item.id]"
              @click="quickCrossSeed(item)"
            >
              <v-icon start size="small">mdi-seed-plus</v-icon>
              {{ t("CrossSeed.quickCrossSeed") }}
            </v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
