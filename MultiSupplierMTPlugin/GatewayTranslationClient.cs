using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace MultiSupplierMTPlugin
{
    class GatewayTranslationClient
    {
        private readonly HttpClient _httpClient;
        private readonly MultiSupplierMTGeneralSettings _settings;
        private readonly string _baseUrl;

        public GatewayTranslationClient(MultiSupplierMTGeneralSettings settings)
        {
            _settings = settings ?? new MultiSupplierMTGeneralSettings();
            _baseUrl = NormalizeBaseUrl(_settings.GatewayBaseUrl);

            var timeoutMs = Math.Max(_settings.GatewayTimeoutMs, 5000);
            _httpClient = new HttpClient { Timeout = TimeSpan.FromMilliseconds(timeoutMs) };
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "MemoQ-MT-Plugin-Gateway-Client");
        }

        public bool IsEnabled => _settings.EnableGateway;

        public async Task<GatewayDesktopVersionInfo> GetDesktopVersionAsync(CancellationToken cToken)
        {
            return await GetAsync<GatewayDesktopVersionInfo>("/desktop/version", cToken);
        }

        public async Task<List<string>> TranslateAsync(
            List<string> texts,
            List<string> plainTexts,
            string srcLangCode,
            string trgLangCode,
            List<string> tmSources,
            List<string> tmTargets,
            object metaData,
            CancellationToken cToken,
            string providerId,
            string requestType,
            string model = null)
        {
            if (!_settings.EnableGateway)
                throw new InvalidOperationException("Gateway mode is disabled.");

            if (texts == null || texts.Count == 0)
                return new List<string>();

            var request = BuildMtRequest(texts, plainTexts, srcLangCode, trgLangCode, tmSources, tmTargets, metaData, providerId, requestType, model);
            var payload = await PostAsync<GatewayTranslateResponse>("mt", "/translate", request, cToken);

            if (payload == null)
                throw new GatewayClientException("Gateway response is empty.");

            if (!payload.Success)
            {
                var msg = payload.Error?.Message ?? "Gateway returned unsuccessful result.";
                throw new GatewayClientException(msg, payload.Error?.Code, payload.RequestId, payload.TraceId);
            }

            if (payload.Translations != null && payload.Translations.Count > 0)
            {
                if (payload.Translations.Count != texts.Count)
                    throw new GatewayClientException("Gateway returned unexpected translation count.");
                return payload.Translations;
            }

            if (payload.Results != null && payload.Results.Count > 0)
            {
                var ordered = payload.Results
                    .Where(x => x != null)
                    .OrderBy(x => x.Index)
                    .ToList();

                if (ordered.Any(x => !x.Ok))
                {
                    var failed = ordered.FirstOrDefault(x => !x.Ok);
                    throw new GatewayClientException($"Gateway segment failed at index {failed.Index}: {failed.ErrorMessage}");
                }

                var results = ordered.Select(x => x.Translation ?? string.Empty).ToList();

                if (results.Count != texts.Count)
                    throw new GatewayClientException("Gateway returned unexpected translation count.");
                return results;
            }

            throw new GatewayClientException("Gateway response is missing translated segments.");
        }

        public async Task<List<GatewayTmHit>> LookupTmAsync(
            List<string> texts,
            string srcLangCode,
            string trgLangCode,
            object metaData,
            CancellationToken cToken,
            string providerId,
            string requestType,
            string model = null)
        {
            if (!_settings.EnableGateway)
                throw new InvalidOperationException("Gateway mode is disabled.");

            if (texts == null || texts.Count == 0)
                return new List<GatewayTmHit>();

            var request = BuildLookupRequest(texts, null, srcLangCode, trgLangCode, metaData, providerId, requestType, model, "tm");
            var payload = await PostAsync<GatewayTmResponse>("tm", "/lookup", request, cToken);

            if (payload == null)
                throw new GatewayClientException("Gateway TM response is empty.");

            if (!payload.Success)
            {
                var msg = payload.Error?.Message ?? "Gateway TM lookup returned unsuccessful result.";
                throw new GatewayClientException(msg, payload.Error?.Code, payload.RequestId, payload.TraceId);
            }

            return payload.Hits ?? new List<GatewayTmHit>();
        }

        public async Task<List<GatewayTbTerm>> SearchTbAsync(
            List<string> texts,
            string srcLangCode,
            string trgLangCode,
            object metaData,
            CancellationToken cToken,
            string providerId,
            string requestType,
            string model = null)
        {
            if (!_settings.EnableGateway)
                throw new InvalidOperationException("Gateway mode is disabled.");

            if (texts == null || texts.Count == 0)
                return new List<GatewayTbTerm>();

            var request = BuildLookupRequest(texts, null, srcLangCode, trgLangCode, metaData, providerId, requestType, model, "tb");
            var payload = await PostAsync<GatewayTbResponse>("tb", "/search", request, cToken);

            if (payload == null)
                throw new GatewayClientException("Gateway TB response is empty.");

            if (!payload.Success)
            {
                var msg = payload.Error?.Message ?? "Gateway TB lookup returned unsuccessful result.";
                throw new GatewayClientException(msg, payload.Error?.Code, payload.RequestId, payload.TraceId);
            }

            return payload.Terms ?? new List<GatewayTbTerm>();
        }

        public async Task<List<GatewayQaIssue>> CheckQaAsync(
            List<string> texts,
            string srcLangCode,
            string trgLangCode,
            object metaData,
            CancellationToken cToken,
            string providerId,
            string requestType,
            string model = null)
        {
            if (!_settings.EnableGateway)
                throw new InvalidOperationException("Gateway mode is disabled.");

            if (texts == null || texts.Count == 0)
                return new List<GatewayQaIssue>();

            var request = BuildLookupRequest(texts, null, srcLangCode, trgLangCode, metaData, providerId, requestType, model, "qa");
            var payload = await PostAsync<GatewayQaResponse>("qa", "/check", request, cToken);

            if (payload == null)
                throw new GatewayClientException("Gateway QA response is empty.");

            if (!payload.Success)
            {
                var msg = payload.Error?.Message ?? "Gateway QA check returned unsuccessful result.";
                throw new GatewayClientException(msg, payload.Error?.Code, payload.RequestId, payload.TraceId);
            }

            return payload.Issues ?? new List<GatewayQaIssue>();
        }

        private async Task<TResponse> PostAsync<TResponse>(string interfaceName, string endpoint, object request, CancellationToken cToken)
        {
            var body = JsonConvert.SerializeObject(request);
            HttpResponseMessage response;

            try
            {
                response = await _httpClient.PostAsync(
                    $"{_baseUrl}/{interfaceName}{endpoint}",
                    new StringContent(body, Encoding.UTF8, "application/json"),
                    cToken
                );
            }
            catch (Exception ex)
            {
                throw new GatewayClientException("Failed to call local memoQ AI Gateway desktop service.", "DESKTOP_UNAVAILABLE", null, null, null, ex);
            }

            var responseText = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                if (!string.IsNullOrWhiteSpace(responseText))
                {
                    try
                    {
                        var errorResponse = SafeDeserializeResponse(responseText);
                        var errorMessage = errorResponse?.Error?.Message ?? "Gateway request failed";
                        throw new GatewayClientException(
                            errorMessage,
                            errorResponse?.Error?.Code ?? BuildHttpErrorCode(response.StatusCode),
                            errorResponse?.RequestId,
                            errorResponse?.TraceId,
                            (int)response.StatusCode);
                    }
                    catch (JsonException)
                    {
                        throw new GatewayClientException(
                            $"Gateway request failed: {(int)response.StatusCode} {(response.ReasonPhrase ?? "Unknown")} ",
                            BuildHttpErrorCode(response.StatusCode),
                            null,
                            null,
                            (int)response.StatusCode);
                    }
                }

                throw new GatewayClientException(
                    $"Gateway request failed: {(int)response.StatusCode} {(response.ReasonPhrase ?? "Unknown")} ",
                    BuildHttpErrorCode(response.StatusCode),
                    null,
                    null,
                    (int)response.StatusCode);
            }

            try
            {
                return JsonConvert.DeserializeObject<TResponse>(responseText);
            }
            catch (JsonException ex)
            {
                throw new GatewayClientException(
                    "Cannot parse gateway response",
                    "RESPONSE_PARSE_ERROR",
                    null,
                    null,
                    (int)response.StatusCode,
                    ex);
            }
        }

        private async Task<TResponse> GetAsync<TResponse>(string endpoint, CancellationToken cToken)
        {
            HttpResponseMessage response;
            try
            {
                response = await _httpClient.GetAsync($"{_baseUrl}{endpoint}", cToken);
            }
            catch (Exception ex)
            {
                throw new GatewayClientException("Failed to call local memoQ AI Gateway desktop service.", "DESKTOP_UNAVAILABLE", null, null, null, ex);
            }

            var responseText = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                throw new GatewayClientException(
                    $"Gateway request failed: {(int)response.StatusCode} {(response.ReasonPhrase ?? "Unknown")}",
                    BuildHttpErrorCode(response.StatusCode),
                    null,
                    null,
                    (int)response.StatusCode);
            }

            try
            {
                return JsonConvert.DeserializeObject<TResponse>(responseText);
            }
            catch (JsonException ex)
            {
                throw new GatewayClientException("Cannot parse gateway response", "RESPONSE_PARSE_ERROR", null, null, (int)response.StatusCode, ex);
            }
        }

        private static GatewayErrorResponse SafeDeserializeResponse(string responseText)
        {
            return JsonConvert.DeserializeObject<GatewayErrorResponse>(responseText);
        }

        private static string BuildHttpErrorCode(HttpStatusCode statusCode)
        {
            return $"HTTP_{(int)statusCode}";
        }

        private GatewayMtRequest BuildMtRequest(
            List<string> texts,
            List<string> plainTexts,
            string srcLangCode,
            string trgLangCode,
            List<string> tmSources,
            List<string> tmTargets,
            object metaData,
            string providerId,
            string requestType,
            string model)
        {
            return new GatewayMtRequest
            {
                RequestId = Guid.NewGuid().ToString("N"),
                Interface = "mt",
                PluginVersion = GetPluginVersion(),
                ContractVersion = DesktopContract.ContractVersion,
                SourceLanguage = srcLangCode,
                TargetLanguage = trgLangCode,
                RequestType = requestType,
                Model = model ?? string.Empty,
                ProviderId = providerId ?? string.Empty,
                RequestedAtUtc = DateTime.UtcNow,
                Segments = texts.Select((text, index) =>
                {
                    return new GatewayMtSegment
                    {
                        Index = index,
                        Text = text,
                        PlainText = plainTexts != null && plainTexts.Count > index ? plainTexts[index] : null,
                        TmSource = tmSources != null && tmSources.Count > index ? tmSources[index] : null,
                        TmTarget = tmTargets != null && tmTargets.Count > index ? tmTargets[index] : null,
                    };
                }).ToList(),
                Metadata = BuildMetadata(metaData),
            };
        }

        private GatewayLookupRequest BuildLookupRequest(
            List<string> texts,
            List<string> plainTexts,
            string srcLangCode,
            string trgLangCode,
            object metaData,
            string providerId,
            string requestType,
            string model,
            string interfaceName)
        {
            return new GatewayLookupRequest
            {
                RequestId = Guid.NewGuid().ToString("N"),
                Interface = interfaceName,
                PluginVersion = GetPluginVersion(),
                ContractVersion = DesktopContract.ContractVersion,
                SourceLanguage = srcLangCode,
                TargetLanguage = trgLangCode,
                RequestType = requestType,
                Model = model ?? string.Empty,
                ProviderId = providerId ?? string.Empty,
                RequestedAtUtc = DateTime.UtcNow,
                Segments = texts.Select((text, index) =>
                {
                    return new GatewayLookupSegment
                    {
                        Index = index,
                        Text = text,
                        PlainText = plainTexts != null && plainTexts.Count > index ? plainTexts[index] : null,
                    };
                }).ToList(),
                Metadata = BuildMetadata(metaData),
            };
        }

        private GatewayMetadata BuildMetadata(object metaData)
        {
            if (metaData == null)
                return null;

            return new GatewayMetadata
            {
                ProjectId = ReadMetadataString(metaData, "PorjectID") ?? ReadMetadataString(metaData, "ProjectID") ?? string.Empty,
                Client = ReadMetadataString(metaData, "Client") ?? string.Empty,
                Domain = ReadMetadataString(metaData, "Domain") ?? string.Empty,
                Subject = ReadMetadataString(metaData, "Subject") ?? string.Empty,
                DocumentId = ReadMetadataGuid(metaData, "DocumentID"),
                ProjectGuid = ReadMetadataGuid(metaData, "ProjectGuid"),
                SegmentMetadata = ReadMetadataSegmentMetadata(metaData),
            };
        }

        private string ReadMetadataString(object metadata, string name)
        {
            var property = metadata.GetType().GetProperty(name);
            if (property == null)
                return null;

            var value = property.GetValue(metadata, null);
            return value?.ToString();
        }

        private Guid ReadMetadataGuid(object metadata, string name)
        {
            var property = metadata.GetType().GetProperty(name);
            if (property == null)
                return Guid.Empty;

            var value = property.GetValue(metadata, null);
            return value is Guid guid ? guid : Guid.Empty;
        }

        private List<GatewaySegmentMetadata> ReadMetadataSegmentMetadata(object metadata)
        {
            var property = metadata.GetType().GetProperty("SegmentLevelMetadata");
            if (property == null)
                return null;

            var value = property.GetValue(metadata, null);
            if (value == null)
                return null;

            var sourceList = value as System.Collections.IEnumerable;
            if (sourceList == null)
                return new List<GatewaySegmentMetadata>();

            var results = new List<GatewaySegmentMetadata>();
            foreach (var item in sourceList)
            {
                if (item == null) continue;

                var itemType = item.GetType();
                results.Add(new GatewaySegmentMetadata
                {
                    SegmentId = ReadGuidProperty(item, itemType, "SegmentID"),
                    SegmentStatus = ReadUInt16Property(item, itemType, "SegmentStatus"),
                    SegmentIndex = ReadInt32Property(item, itemType, "SegmentIndex"),
                });
            }

            return results;
        }

        private Guid ReadGuidProperty(object obj, Type type, string propertyName)
        {
            var property = type.GetProperty(propertyName);
            if (property == null) return Guid.Empty;

            var value = property.GetValue(obj, null);
            return value is Guid guid ? guid : Guid.Empty;
        }

        private ushort ReadUInt16Property(object obj, Type type, string propertyName)
        {
            var property = type.GetProperty(propertyName);
            if (property == null) return 0;

            var value = property.GetValue(obj, null);
            if (value == null) return 0;

            try
            {
                return Convert.ToUInt16(value);
            }
            catch
            {
                return 0;
            }
        }

        private int ReadInt32Property(object obj, Type type, string propertyName)
        {
            var property = type.GetProperty(propertyName);
            if (property == null) return 0;

            var value = property.GetValue(obj, null);
            if (value == null) return 0;

            try
            {
                return Convert.ToInt32(value);
            }
            catch
            {
                return 0;
            }
        }

        private string NormalizeBaseUrl(string baseUrl)
        {
            if (string.IsNullOrWhiteSpace(baseUrl))
                return DesktopContract.DefaultGatewayBaseUrl;

            if (baseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                return baseUrl.TrimEnd('/');
            }

            return $"http://{baseUrl.TrimEnd('/')}";
        }

        private string GetPluginVersion()
        {
            return Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "unknown";
        }
    }

    class GatewayClientException : Exception
    {
        public GatewayClientException(string message, string errorCode = null, string requestId = null, string traceId = null, int? httpStatusCode = null, Exception innerException = null)
            : base(message, innerException)
        {
            ErrorCode = errorCode;
            RequestId = requestId;
            TraceId = traceId;
            HttpStatusCode = httpStatusCode;
        }

        public string ErrorCode { get; }
        public string RequestId { get; }
        public string TraceId { get; }
        public int? HttpStatusCode { get; }
    }

    class GatewayBaseRequest
    {
        [JsonProperty("requestId")]
        public string RequestId { get; set; } = string.Empty;

        [JsonProperty("interface")]
        public string Interface { get; set; } = "";

        [JsonProperty("sourceLanguage")]
        public string SourceLanguage { get; set; } = string.Empty;

        [JsonProperty("pluginVersion")]
        public string PluginVersion { get; set; } = string.Empty;

        [JsonProperty("contractVersion")]
        public string ContractVersion { get; set; } = string.Empty;

        [JsonProperty("targetLanguage")]
        public string TargetLanguage { get; set; } = string.Empty;

        [JsonProperty("requestType")]
        public string RequestType { get; set; } = string.Empty;

        [JsonProperty("model")]
        public string Model { get; set; } = string.Empty;

        [JsonProperty("providerId")]
        public string ProviderId { get; set; } = string.Empty;

        [JsonProperty("requestedAtUtc")]
        public DateTime RequestedAtUtc { get; set; } = DateTime.UtcNow;

        [JsonProperty("segments")]
        public List<GatewayLookupSegment> Segments { get; set; } = new List<GatewayLookupSegment>();

        [JsonProperty("metadata")]
        public GatewayMetadata Metadata { get; set; }
    }

    class GatewayMtRequest : GatewayBaseRequest
    {
        public GatewayMtRequest()
        {
            Interface = "mt";
        }

        [JsonProperty("segments")]
        public new List<GatewayMtSegment> Segments { get; set; } = new List<GatewayMtSegment>();
    }

    class GatewayLookupRequest : GatewayBaseRequest
    {
    }

    class GatewayMtSegment
    {
        [JsonProperty("index")]
        public int Index { get; set; }

        [JsonProperty("text")]
        public string Text { get; set; } = string.Empty;

        [JsonProperty("plainText")]
        public string PlainText { get; set; } = string.Empty;

        [JsonProperty("tmSource")]
        public string TmSource { get; set; } = string.Empty;

        [JsonProperty("tmTarget")]
        public string TmTarget { get; set; } = string.Empty;
    }

    class GatewayLookupSegment
    {
        [JsonProperty("index")]
        public int Index { get; set; }

        [JsonProperty("text")]
        public string Text { get; set; } = string.Empty;

        [JsonProperty("plainText")]
        public string PlainText { get; set; } = string.Empty;
    }

    class GatewayMetadata
    {
        [JsonProperty("projectId")]
        public string ProjectId { get; set; } = string.Empty;

        [JsonProperty("client")]
        public string Client { get; set; } = string.Empty;

        [JsonProperty("domain")]
        public string Domain { get; set; } = string.Empty;

        [JsonProperty("subject")]
        public string Subject { get; set; } = string.Empty;

        [JsonProperty("documentId")]
        public Guid DocumentId { get; set; } = Guid.Empty;

        [JsonProperty("projectGuid")]
        public Guid ProjectGuid { get; set; } = Guid.Empty;

        [JsonProperty("segmentMetadata")]
        public List<GatewaySegmentMetadata> SegmentMetadata { get; set; } = new List<GatewaySegmentMetadata>();
    }

    class GatewaySegmentMetadata
    {
        [JsonProperty("segmentId")]
        public Guid SegmentId { get; set; } = Guid.Empty;

        [JsonProperty("segmentStatus")]
        public ushort SegmentStatus { get; set; } = 0;

        [JsonProperty("segmentIndex")]
        public int SegmentIndex { get; set; } = 0;
    }

    class GatewayBaseResponse
    {
        [JsonProperty("requestId")]
        public string RequestId { get; set; } = string.Empty;

        [JsonProperty("traceId")]
        public string TraceId { get; set; } = string.Empty;

        [JsonProperty("interface")]
        public string Interface { get; set; } = "";

        [JsonProperty("success")]
        public bool Success { get; set; } = true;

        [JsonProperty("providerId")]
        public string ProviderId { get; set; } = string.Empty;

        [JsonProperty("model")]
        public string Model { get; set; } = string.Empty;

        [JsonProperty("error")]
        public GatewayError Error { get; set; }
    }

    class GatewayTranslateResponse : GatewayBaseResponse
    {
        public GatewayTranslateResponse()
        {
            Interface = "mt";
        }

        [JsonProperty("translations")]
        public List<string> Translations { get; set; }

        [JsonProperty("results")]
        public List<GatewayTranslateResponseItem> Results { get; set; }
    }

    class GatewayTmResponse : GatewayBaseResponse
    {
        public GatewayTmResponse()
        {
            Interface = "tm";
        }

        [JsonProperty("hits")]
        public List<GatewayTmHit> Hits { get; set; }
    }

    class GatewayTbResponse : GatewayBaseResponse
    {
        public GatewayTbResponse()
        {
            Interface = "tb";
        }

        [JsonProperty("terms")]
        public List<GatewayTbTerm> Terms { get; set; }
    }

    class GatewayQaResponse : GatewayBaseResponse
    {
        public GatewayQaResponse()
        {
            Interface = "qa";
        }

        [JsonProperty("issues")]
        public List<GatewayQaIssue> Issues { get; set; }
    }

    class GatewayTranslateResponseItem
    {
        [JsonProperty("index")]
        public int Index { get; set; }

        [JsonProperty("ok")]
        public bool Ok { get; set; } = true;

        [JsonProperty("translation")]
        public string Translation { get; set; } = string.Empty;

        [JsonProperty("errorMessage")]
        public string ErrorMessage { get; set; } = string.Empty;
    }

    class GatewayTmHit
    {
        [JsonProperty("providerId")]
        public string ProviderId { get; set; } = string.Empty;

        [JsonProperty("model")]
        public string Model { get; set; } = string.Empty;

        [JsonProperty("source")]
        public string Source { get; set; } = string.Empty;

        [JsonProperty("target")]
        public string Target { get; set; } = string.Empty;

        [JsonProperty("score")]
        public int Score { get; set; } = 0;

        [JsonProperty("sourceLang")]
        public string SourceLang { get; set; } = string.Empty;

        [JsonProperty("targetLang")]
        public string TargetLang { get; set; } = string.Empty;

        [JsonProperty("context")]
        public string Context { get; set; } = string.Empty;

        [JsonProperty("id")]
        public string Id { get; set; } = string.Empty;

        [JsonProperty("createdAt")]
        public string CreatedAt { get; set; } = string.Empty;
    }

    class GatewayTbTerm
    {
        [JsonProperty("providerId")]
        public string ProviderId { get; set; } = string.Empty;

        [JsonProperty("model")]
        public string Model { get; set; } = string.Empty;

        [JsonProperty("sourceTerm")]
        public string SourceTerm { get; set; } = string.Empty;

        [JsonProperty("targetTerm")]
        public string TargetTerm { get; set; } = string.Empty;

        [JsonProperty("sourceLang")]
        public string SourceLang { get; set; } = string.Empty;

        [JsonProperty("targetLang")]
        public string TargetLang { get; set; } = string.Empty;

        [JsonProperty("externalId")]
        public string ExternalId { get; set; } = string.Empty;

        [JsonProperty("matchType")]
        public string MatchType { get; set; } = string.Empty;

        [JsonProperty("score")]
        public double Score { get; set; } = 0;
    }

    class GatewayQaIssue
    {
        [JsonProperty("providerId")]
        public string ProviderId { get; set; } = string.Empty;

        [JsonProperty("model")]
        public string Model { get; set; } = string.Empty;

        [JsonProperty("segmentIndex")]
        public int SegmentIndex { get; set; } = 0;

        [JsonProperty("code")]
        public string Code { get; set; } = string.Empty;

        [JsonProperty("message")]
        public string Message { get; set; } = string.Empty;

        [JsonProperty("severity")]
        public string Severity { get; set; } = string.Empty;

        [JsonProperty("source")]
        public string Source { get; set; } = string.Empty;
    }

    class GatewayErrorResponse
    {
        [JsonProperty("requestId")]
        public string RequestId { get; set; } = string.Empty;

        [JsonProperty("traceId")]
        public string TraceId { get; set; } = string.Empty;

        [JsonProperty("error")]
        public GatewayError Error { get; set; }
    }

    class GatewayDesktopVersionInfo
    {
        [JsonProperty("productName")]
        public string ProductName { get; set; } = string.Empty;

        [JsonProperty("desktopVersion")]
        public string DesktopVersion { get; set; } = string.Empty;

        [JsonProperty("contractVersion")]
        public string ContractVersion { get; set; } = string.Empty;

        [JsonProperty("mt")]
        public GatewayDesktopMtSettings Mt { get; set; } = new GatewayDesktopMtSettings();
    }

    class GatewayDesktopMtSettings
    {
        [JsonProperty("maxBatchSegments")]
        public int MaxBatchSegments { get; set; } = 1;

        [JsonProperty("requestTimeoutMs")]
        public int RequestTimeoutMs { get; set; } = 120000;
    }

    class GatewayError
    {
        [JsonProperty("code")]
        public string Code { get; set; } = "Unknown";

        [JsonProperty("message")]
        public string Message { get; set; } = string.Empty;
    }
}
