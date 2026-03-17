using MemoQ.MTInterfaces;
using MultiSupplierMTPlugin.Helpers;
using System;
using System.Drawing;
using System.Reflection;

namespace MultiSupplierMTPlugin
{
    class MultiSupplierMTEngine : EngineBase
    {
        private readonly MultiSupplierMTOptions _mtOptions;
        private readonly GatewayTranslationClient _gatewayClient;
        private readonly LimitHelper _gatewayLimitHelper;
        private readonly RequestType _requestType;
        private readonly string _srcLangCode;
        private readonly string _trgLangCode;

        public MultiSupplierMTEngine(MultiSupplierMTOptions mtOptions, RequestType requestType, string srcLangCode, string trgLangCode)
        {
            this._mtOptions = mtOptions;
            this._gatewayClient = new GatewayTranslationClient(mtOptions.GeneralSettings);
            var settings = mtOptions.GeneralSettings;
            this._gatewayLimitHelper = new LimitHelper(
                Math.Max(settings.MaxRequestsHold, 1),
                Math.Max(settings.MaxRequestsPerWindow, 1),
                Math.Max(settings.WindowSizeMs, 1),
                settings.RequestSmoothness
            );
            this._requestType = requestType;
            this._srcLangCode = srcLangCode;
            this._trgLangCode = trgLangCode;
        }

        #region IEngine Members

        public override bool SupportsFuzzyCorrection
        {
            get { return true; }
        }

        public override void SetProperty(string name, string value)
        {
            throw new NotImplementedException();
        }

        public override Image SmallIcon
        {
            get
            {
                return Image.FromStream(Assembly.GetExecutingAssembly().GetManifestResourceStream("MultiSupplierMTPlugin.Icon.png"));
            }
        }

        public override ISession CreateLookupSession()
        {
            return new MultiSupplierMTSession(_mtOptions, _gatewayClient, _gatewayLimitHelper, _requestType, _srcLangCode, _trgLangCode);
        }

        public override ISessionForStoringTranslations CreateStoreTranslationSession()
        {
            return new MultiSupplierMTSession(_mtOptions, _gatewayClient, _gatewayLimitHelper, _requestType, _srcLangCode, _trgLangCode);
        }

        #endregion

        #region IDisposable Members

        public override void Dispose()
        {
        }

        #endregion
    }
}
