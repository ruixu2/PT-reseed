<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import { sendMessage } from "@/messages.ts";
import type { ISearchResultTorrent } from "@/shared/types.ts";
import { useRuntimeStore } from "@/options/stores/runtime.ts";
import { useMetadataStore } from "@/options/stores/metadata.ts";

import SentToDownloaderDialog from "@/options/components/SentToDownloaderDialog/Index.vue";
import KeepUploadDialog from "./KeepUploadDialog.vue";

const { torrentItems, density = "default" } = defineProps<{
  torrentItems: ISearchResultTorrent[];
  density?: "compact" | "default";
}>();

const btnSize = computed(() => {
  return density === "compact" ? "small" : "default";
});

const { t } = useI18n();
const metadataStore = useMetadataStore();
const runtimeStore = useRuntimeStore();

async function getTorrentDownloadLinks() {
  const downloadUrls = [];

  for (const torrent of torrentItems) {
    const downloadUrl = await sendMessage("getTorrentDownloadLink", torrent);
    sendMessage("logger", { msg: `torrent ${torrent} download link: ${downloadUrl}` }).catch();
    downloadUrls.push({ torrent, downloadUrl });
  }

  return downloadUrls;
}

const copyTorrentDownloadLinkBtnStatus = ref(false);
async function copyTorrentDownloadLink() {
  copyTorrentDownloadLinkBtnStatus.value = true;
  const downloadUrls = await getTorrentDownloadLinks();
  try {
    await navigator.clipboard.writeText(
      downloadUrls
        .map((x) => x.downloadUrl)
        .join("\n")
        .trim(),
    );
    runtimeStore.showSnakebar(t("SearchEntity.ActionTd.copyLinkSuccess"), { color: "success" });
  } catch (e) {
    runtimeStore.showSnakebar(t("SearchEntity.ActionTd.copyLinkFailed"), { color: "error" });
  }

  copyTorrentDownloadLinkBtnStatus.value = false;
}

const localDlTorrentDownloadLinkBtnStatus = ref(false);
async function localDlTorrentDownloadLink() {
  localDlTorrentDownloadLinkBtnStatus.value = true;
  await Promise.allSettled(
    torrentItems.map((torrent) => sendMessage("downloadTorrent", { torrent, downloaderId: "local" })),
  );
  localDlTorrentDownloadLinkBtnStatus.value = false;
}

const showDownloadClientDialog = ref(false);
const isDefaultSend = ref(false);

function sendToDownloader(defaultDownload = false) {
  isDefaultSend.value = defaultDownload;
  showDownloadClientDialog.value = true;
}

const showKeepUploadDialog = ref(false);

function openKeepUploadDialog() {
  showKeepUploadDialog.value = true;
}

const localMatches = ref<any[]>([]);
async function checkLocalMatch() {
  if (torrentItems.length !== 1) return;
  const torrent = torrentItems[0];
  if (!torrent.size) return;
  localMatches.value = (await sendMessage("findLocalTorrentBySize", torrent.size)) as any[];
}

computed(() => {
  checkLocalMatch();
});

// Since computed above won't trigger if not used, we use a watch or onMounted
import { onMounted, watch } from "vue";
onMounted(checkLocalMatch);
watch(() => torrentItems, checkLocalMatch, { deep: true });

async function quickCrossSeed(match: any) {
  const torrent = torrentItems[0];
  try {
    const result: any = await sendMessage("downloadTorrent", {
      torrent,
      downloaderId: match.clientId,
      options: {
        savePath: match.savePath,
        addAtPaused: true, // 辅种默认暂停安全
      },
    });
    if (result.success) {
      runtimeStore.showSnakebar(t("CrossSeed.sendSuccess"), { color: "success" });
    } else {
      runtimeStore.showSnakebar(t("CrossSeed.sendError"), { color: "error" });
    }
  } catch (e) {
    runtimeStore.showSnakebar(t("CrossSeed.sendError"), { color: "error" });
  }
}
</script>

<template>
  <v-btn-group :density="density" class="table-action" color="grey" variant="text">
    <!-- 快速辅种按钮 (仅当存在本地匹配时显示) -->
    <v-menu v-if="localMatches.length > 0" open-on-hover>
      <template v-slot:activator="{ props }">
        <v-btn
          v-bind="props"
          :size="btnSize"
          icon="mdi-seed-plus"
          color="success"
          :title="t('CrossSeed.quickCrossSeed')"
        />
      </template>
      <v-list density="compact">
        <v-list-subheader>{{ t("CrossSeed.selectTargetClient") }}</v-list-subheader>
        <v-list-item v-for="m in localMatches" :key="m.infoHash" @click="quickCrossSeed(m)">
          <v-list-item-title>{{ m.clientId }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">{{ m.savePath }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-menu>

    <v-btn
      v-if="metadataStore.defaultDownloader?.id"
      :disabled="torrentItems.length == 0"
      :size="btnSize"
      icon="mdi-download"
      :title="t('SearchEntity.ActionTd.sendToDefault')"
      @click="() => sendToDownloader(true)"
    />

    <!-- 下载到服务器 -->
    <v-btn
      :disabled="torrentItems.length == 0"
      :size="btnSize"
      icon="mdi-cloud-download"
      :title="t('SearchEntity.ActionTd.sendToDownloader')"
      @click="() => sendToDownloader()"
    />
    <!-- 复制下载链接 -->
    <v-btn
      :disabled="torrentItems.length == 0"
      :loading="copyTorrentDownloadLinkBtnStatus"
      :size="btnSize"
      icon="mdi-content-copy"
      :title="t('SearchEntity.ActionTd.copyLink')"
      @click="() => copyTorrentDownloadLink()"
    />
    <!-- 下载种子文件到本地 -->
    <v-btn
      :disabled="torrentItems.length == 0"
      :loading="localDlTorrentDownloadLinkBtnStatus"
      :size="btnSize"
      icon="mdi-content-save"
      :title="t('SearchEntity.ActionTd.localDownload')"
      @click="() => localDlTorrentDownloadLink()"
    />
    <!-- 辅种检测 -->
    <v-btn
      :disabled="torrentItems.length < 2"
      :size="btnSize"
      icon="mdi-merge"
      :title="t('SearchEntity.KeepUploadDialog.keepUpload')"
      @click="openKeepUploadDialog"
    />
  </v-btn-group>

  <!-- 在点击发送到远程服务器时，弹出选择下载器及其他自定义选项 -->
  <SentToDownloaderDialog
    v-model="showDownloadClientDialog"
    :torrent-items="torrentItems"
    :is-default-send="isDefaultSend"
  />

  <!-- 辅种检测对话框 -->
  <KeepUploadDialog v-model="showKeepUploadDialog" :torrent-items="torrentItems" />
</template>

<style scoped lang="scss"></style>
