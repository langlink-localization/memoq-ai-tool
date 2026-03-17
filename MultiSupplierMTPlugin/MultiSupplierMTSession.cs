using MemoQ.Addins.Common.DataStructures;
using MemoQ.Addins.Common.Utils;
using MemoQ.MTInterfaces;
using MultiSupplierMTPlugin.Helpers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Text;
using System.Threading.Tasks;
using LLH = MultiSupplierMTPlugin.Localized.LocalizedHelper;
using LLK = MultiSupplierMTPlugin.Localized.LocalizedKeyCommon;

namespace MultiSupplierMTPlugin
{
#if COMPATIBLE_OLD_VERSION
    public class MTRequestMetadata
    {
        public string PorjectID { get; set; } = String.Empty;

        public string Client { get; set; } = String.Empty;

        public string Domain { get; set; } = String.Empty;

        public string Subject { get; set; } = String.Empty;

        public Guid DocumentID { get; set; } = Guid.Empty;

        public Guid ProjectGuid { get; set; } = Guid.Empty;

        public List<SegmentMetadata> SegmentLevelMetadata { get; set; } = new List<SegmentMetadata>();
    }

    public class SegmentMetadata
    {
        public Guid SegmentID { get; set; } = Guid.Empty;

        public ushort SegmentStatus { get; set; } = 0;

        public int SegmentIndex { get; set; } = 0;
    }
    class MultiSupplierMTSession : ISession, ISessionForStoringTranslations
#else
    class MultiSupplierMTSession : ISessionWithMetadata, ISessionForStoringTranslations
#endif
    {
        private readonly MultiSupplierMTGeneralSettings _mtGeneralSettings;
        private readonly GatewayTranslationClient _gatewayClient;
        private readonly RequestType _requestType;
        private readonly LimitHelper _gatewayLimitHelper;

        private readonly string _srcLangCode;
        private readonly string _trgLangCode;
        private int? _desktopMaxBatchSegments;
        private const string DesktopGatewayRequiredMessage = "Desktop gateway mode is required for translation requests.";

        public MultiSupplierMTSession(MultiSupplierMTOptions mtOptions, GatewayTranslationClient gatewayClient, LimitHelper gatewayLimitHelper, RequestType requestType, string srcLangCode, string trgLangCode)
        {
            this._mtGeneralSettings = mtOptions.GeneralSettings;
            this._gatewayClient = gatewayClient;
            this._gatewayLimitHelper = gatewayLimitHelper ?? throw new ArgumentNullException(nameof(gatewayLimitHelper));
            this._requestType = requestType;
            this._srcLangCode = srcLangCode;
            this._trgLangCode = trgLangCode;
        }

        #region ISessionWithMetadata Members

        public TranslationResult TranslateCorrectSegment(Segment segm, Segment tmSource, Segment tmTarget)
        {
            return TranslateCorrectSegment(segm, tmSource, tmTarget, null);
        }

        public TranslationResult[] TranslateCorrectSegment(Segment[] segs, Segment[] tmSources, Segment[] tmTargets)
        {
            return TranslateCorrectSegment(segs, tmSources, tmTargets, null);
        }

        public TranslationResult TranslateCorrectSegment(Segment segm, Segment tmSource, Segment tmTarget, MTRequestMetadata metaData)
        {
            return TranslateCorrectSegment(new Segment[] { segm }, new Segment[] { tmSource }, new Segment[] { tmTarget }, metaData)[0];
        }

        public TranslationResult[] TranslateCorrectSegment(Segment[] srcSegms, Segment[] tmSrcSegms, Segment[] tmTgtSegms, MTRequestMetadata metaData)
        {
            //memoQ 10.0 之前的版本不支持这两个参数
            var hasTm = tmSrcSegms != null && tmTgtSegms != null;

            //记录未翻译文本在原始列表中的位置，翻译后才能将结果放入原始位置
            var untransOriginalIndices = new List<int>();  
            
            var untransSrcTexts = new List<string>();                  //未翻译的句段文本列表（可能包含标记或标签）
            var untransSrcPlainTexts = new List<string>();             //未翻译的句段纯文本列表（不包含标记或标签，用于术语查找）

            var untransTmSrcTexts = hasTm ? new List<string>() : null; //未翻译句段关联的翻译记忆原文纯文本列表
            var untransTmTgtTexts = hasTm ? new List<string>() : null; //未翻译句段关联的翻译记忆译文纯文本列表

            //最终翻译结果列表
            TranslationResult[] results = new TranslationResult[srcSegms.Length];

            //将句段分成两部分（同时转换成纯文本）：缓存中存在的转换到结果列表，缓存中未存在的转换到未翻译列表
            DivideCachedAndUncached(srcSegms, tmSrcSegms, tmTgtSegms, untransSrcTexts, untransSrcPlainTexts, untransTmSrcTexts, untransTmTgtTexts, untransOriginalIndices, results);

            //翻译缓存中未存在的
            if (untransSrcTexts.Count > 0)
            {
                ProcessUncachedTranslations(srcSegms, untransSrcTexts, untransSrcPlainTexts, untransTmSrcTexts, untransTmTgtTexts, metaData, untransOriginalIndices, results);
            }

            return results;
        }

        #endregion

        #region Helper Function 1

        // 将句段分成两部分（同时转换成纯文本）：缓存中存在的转换到结果列表，缓存中未存在的转换到未翻译列表
        private void DivideCachedAndUncached(
            Segment[] srcSegms, Segment[] tmSrcSegms, Segment[] tmTgtSegms,
            List<string> untransSrcTexts, List<string> untransSrcPlainTexts,
            List<string> untransTmSrcTexts, List<string> untransTmTgtTexts,
            List<int> untransOriginalIndices, TranslationResult[] results)
        {
            bool hasTm = tmSrcSegms != null && tmTgtSegms != null;
            List<string> srcTexts = srcSegms.Select(ConvertSegment2String).ToList();

            for (int i = 0; i < srcTexts.Count; i++)
            {
                untransOriginalIndices.Add(i);

                untransSrcTexts.Add(srcTexts[i]);
                untransSrcPlainTexts.Add(srcSegms[i].PlainText);
                
                if (hasTm)
                {
                    untransTmSrcTexts?.Add(tmSrcSegms[i] != null ? ConvertSegment2String(tmSrcSegms[i]) : "");
                    untransTmTgtTexts?.Add(tmTgtSegms[i] != null ? ConvertSegment2String(tmTgtSegms[i]) : "");
                }
            }
        }

        // 主翻译逻辑
        private void ProcessUncachedTranslations(
            Segment[] srcSegms,
            List<string> untransSrcTexts, List<string> untransSrcPlainTexts,
            List<string> untransTmSrcTexts, List<string> untransTmTgtTexts, MTRequestMetadata metaData,
            List<int> untransOriginalIndices, TranslationResult[] results)
        {
            var tasks = new List<Task>();
            var batches = splitIntoBatches(untransSrcTexts);

            foreach (var (startIndex, count) in batches)
            {
                var batchSrcTexts = untransSrcTexts.Skip(startIndex).Take(count).ToList();
                var batchSrcPlainTexts = untransSrcPlainTexts.Skip(startIndex).Take(count).ToList();
                var batchTmSrcTexts = untransTmSrcTexts?.Skip(startIndex).Take(count).ToList();
                var batchTmTgtTexts = untransTmTgtTexts?.Skip(startIndex).Take(count).ToList();

                tasks.Add(Task.Run(async () =>
                {
                    try
                    {
                        var batchTgtTexts = await TranslateCoreAsync(batchSrcTexts, batchSrcPlainTexts, batchTmSrcTexts, batchTmTgtTexts, metaData);
                        
                        for (int i = 0; i < batchSrcTexts.Count; i++)
                        {
                            int untransIndex = startIndex + i;                        // 在未翻译列表中的索引
                            int originalIndex = untransOriginalIndices[untransIndex]; // 在原始列表中的索引

                            var srcSegm = srcSegms[originalIndex];
                            var srcText = batchSrcTexts[i];
                            var tgtText = batchTgtTexts[i];

                            results[originalIndex] = new TranslationResult();
                            try
                            {
                                results[originalIndex].Translation = ConvertString2Segment(srcSegm, tgtText);
                            }
                            catch (Exception ex)
                            {
                                SetSingleExecption(results, originalIndex, ex);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        SetBatchException(results, untransOriginalIndices, startIndex, count, ex);
                    }
                }));
            }

            Task.WhenAll(tasks).GetAwaiter().GetResult();
        }

        // 大小限制（句段、字符限制）
        private List<(int StartIndex, int Count)> splitIntoBatches(List<string> untransTexts)
        {
            var batches = new List<(int StartIndex, int Count)>();
            int maxSegments = _mtGeneralSettings.EnableCustomRequestLimit && _mtGeneralSettings.MaxSegmentsPerRequest > 0
                ? _mtGeneralSettings.MaxSegmentsPerRequest
                : ResolveDesktopMaxBatchSegments();

            int maxCharacters = _mtGeneralSettings.EnableCustomRequestLimit
                ? _mtGeneralSettings.MaxCharactersPerRequest
                : 0;

            bool limitSegments = maxSegments > 0;
            bool limitCharacters = maxCharacters > 0;

            int startIndex = 0;
            while (startIndex < untransTexts.Count)
            {
                int segmCount = 0;
                int charCount = 0;

                for (int i = startIndex; i < untransTexts.Count; i++)
                {
                    int nextLength = untransTexts[i]?.Length ?? 0;

                    // 总是确保有一个句段，无论句段限制、字符限制是多少
                    bool isNotFirstSegment = segmCount > 0;

                    bool wouldExceedSegmentLimit = limitSegments && (segmCount + 1) > maxSegments;
                    bool wouldExceedCharLimit = limitCharacters && (charCount + nextLength) > maxCharacters;

                    if (isNotFirstSegment && (wouldExceedSegmentLimit || wouldExceedCharLimit))
                        break;

                    segmCount++;
                    charCount += nextLength;
                }

                batches.Add((startIndex, segmCount));
                startIndex += segmCount;
            }

            return batches;
        }

        private int ResolveDesktopMaxBatchSegments()
        {
            if (_desktopMaxBatchSegments.HasValue)
                return _desktopMaxBatchSegments.Value;

            try
            {
                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
                {
                    var version = _gatewayClient.GetDesktopVersionAsync(cts.Token).GetAwaiter().GetResult();
                    var maxSegments = version?.Mt?.MaxBatchSegments ?? 1;
                    _desktopMaxBatchSegments = Math.Max(maxSegments, 1);
                }
            }
            catch
            {
                _desktopMaxBatchSegments = 1;
            }

            return _desktopMaxBatchSegments.Value;
        }

        // 并发限制、速率限制、重试限制
        private async Task<List<string>> TranslateCoreAsync(List<string> batchTexts, List<string> batchPlainTexts, List<string> tmSources, List<string> tmTargets, MTRequestMetadata metaData)
        {
            if (!_mtGeneralSettings.EnableGateway)
                throw new InvalidOperationException(DesktopGatewayRequiredMessage);

            await _gatewayLimitHelper.ThreadHoldWaitting();
            try
            {
                int rateWaitMs = _gatewayLimitHelper.GetRateWaittingMs();
                while (rateWaitMs > 0)
                {
                    await Task.Delay(rateWaitMs);
                    rateWaitMs = _gatewayLimitHelper.GetRateWaittingMs();
                }

                using (var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromMilliseconds(Math.Max(_mtGeneralSettings.GatewayTimeoutMs, 5000))))
                {
                    return await _gatewayClient.TranslateAsync(
                        batchTexts,
                        batchPlainTexts,
                        _srcLangCode,
                        _trgLangCode,
                        tmSources,
                        tmTargets,
                        metaData,
                        cts.Token,
                        DesktopContract.DesktopProviderName,
                        _requestType.ToString()
                    );
                }
            }
            finally
            {
                _gatewayLimitHelper.ThreadHoldRelease();
            }
        }

        #endregion

        #region Helper Function 2
        private void SetSingleExecption(TranslationResult[] results, int originalIndex, Exception ex)
        {
            string msg = LLH.G(LLK.MultiSupplierMTSession_String2SegmentFail);
            var detail = BuildGatewayFailureMessage(ex, DesktopContract.DesktopProviderName, "segment");
            results[originalIndex].Exception = new MTException(msg, detail, ex);
            LoggingHelper.Warn(detail);
        }

        private void SetBatchException(TranslationResult[] results, List<int> untransOriginalIndices, int BatchStartIndex, int BatchCount, Exception ex)
        {
            var msgBuilder = new StringBuilder();
            msgBuilder.AppendLine(LLH.G(LLK.MultiSupplierMTSession_AllSegmentsTranslateFail, BatchCount));
            msgBuilder.AppendLine("\t" + ex.Message);
            if (ex is GatewayClientException)
            {
                msgBuilder.AppendLine("\t" + BuildGatewayFailureMessage(ex, DesktopContract.DesktopProviderName, "batch"));
            }

            if (ex is AggregateException agEx)
            {
                foreach (var inner in agEx.InnerExceptions)
                    msgBuilder.AppendLine("\t\t" + inner.Message);
            }

            string finalMsg = msgBuilder.ToString().TrimEnd();

            for (int i = 0; i < BatchCount; i++)
            {
                int untransIndex = BatchStartIndex + i;
                int originalIndex = untransOriginalIndices[untransIndex];

                results[originalIndex] = new TranslationResult
                {
                    Exception = new MTException(finalMsg, finalMsg, ex)
                };
            }

            LoggingHelper.Warn(finalMsg);
        }

        private string BuildGatewayFailureMessage(Exception ex, string providerId, string action)
        {
            if (ex is GatewayClientException gatewayEx)
            {
                var requestId = string.IsNullOrWhiteSpace(gatewayEx.RequestId) ? "n/a" : gatewayEx.RequestId;
                var traceId = string.IsNullOrWhiteSpace(gatewayEx.TraceId) ? "n/a" : gatewayEx.TraceId;
                var code = string.IsNullOrWhiteSpace(gatewayEx.ErrorCode) ? "n/a" : gatewayEx.ErrorCode;
                var http = gatewayEx.HttpStatusCode.HasValue ? gatewayEx.HttpStatusCode.ToString() : "n/a";
                return $"{action} failed via gateway. requestType={_requestType}, provider={providerId}, code={code}, http={http}, requestId={requestId}, traceId={traceId}, msg={gatewayEx.Message}";
            }

            return $"{action} failed via provider {providerId}, msg={ex.Message}";
        }

        private string ConvertSegment2String(Segment segment)
        {
            switch (_requestType)
            {
                case RequestType.OnlyFormattingWithXml:
                    return SegmentXMLConverter.ConvertSegment2Xml(segment, false, true);
                case RequestType.OnlyFormattingWithHtml:
                    return SegmentHtmlConverter.ConvertSegment2Html(segment, false);
                case RequestType.BothFormattingAndTagsWithXml:
                    return SegmentXMLConverter.ConvertSegment2Xml(segment, true, true);
                case RequestType.BothFormattingAndTagsWithHtml:
                    return SegmentHtmlConverter.ConvertSegment2Html(segment, true);
                default:
                    return segment.PlainText;
            }
        }

        private Segment ConvertString2Segment(Segment originalSegment, string translatedText)
        {
            Segment segment;
            if (_requestType == RequestType.OnlyFormattingWithXml || _requestType == RequestType.BothFormattingAndTagsWithXml)
            {
                segment = SegmentXMLConverter.ConvertXML2Segment(translatedText, originalSegment.ITags);
            }
            else if (_requestType == RequestType.OnlyFormattingWithHtml || _requestType == RequestType.BothFormattingAndTagsWithHtml)
            {
                segment = SegmentHtmlConverter.ConvertHtml2Segment(translatedText, originalSegment.ITags);
            }
            else
            {
                segment = SegmentBuilder.CreateFromString(translatedText);
            }

            if (_requestType == RequestType.BothFormattingAndTagsWithXml || _requestType == RequestType.BothFormattingAndTagsWithHtml)
            {
                if (_mtGeneralSettings.NormalizeWhitespaceAroundTags)
                {
#if COMPATIBLE_OLD_VERSION
                    LoggingHelper.Warn("your memoq version is lower than 9.14 and does not support Normalize Whitespace Around Tags");
#else
                    segment = TagWhitespaceNormalizer.NormalizeWhitespaceAroundTags(originalSegment, segment, this._srcLangCode, this._trgLangCode);                    
#endif
                }
            }
            else
            {
                if (_mtGeneralSettings.InsertRequiredTagsToEnd)
                {
                    SegmentBuilder sb = new SegmentBuilder();
                    sb.AppendSegment(segment);

                    foreach (InlineTag it in originalSegment.ITags)
                        sb.AppendInlineTag(it);

                    segment = sb.ToSegment();
                }
            }

            return segment;
        }

        #endregion

        #region ISessionForStoringTranslations

        public void StoreTranslation(TranslationUnit transunit)
        {
            StoreTranslation(new TranslationUnit[] { transunit });
        }

        public int[] StoreTranslation(TranslationUnit[] transunits)
        {
            int[] stored = new int[transunits.Length];
            for (int i = 0; i < transunits.Length; i++)
            {
                try
                {
                    stored[i] = i;
                }
                catch
                {
                    // do nothing
                }
            }
            return stored;
        }

        #endregion

        #region IDisposable Members

        public void Dispose()
        {
        }

        #endregion
    }
}
