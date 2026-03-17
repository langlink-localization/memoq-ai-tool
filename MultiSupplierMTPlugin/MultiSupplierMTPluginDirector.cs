using MemoQ.Addins.Common.Framework;
using MemoQ.MTInterfaces;
using MultiSupplierMTPlugin.Helpers;
using MultiSupplierMTPlugin.Localized;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace MultiSupplierMTPlugin
{
    public class MultiSupplierMTPluginDirector : PluginDirectorBase, IModule
    {
        private const string ProductDisplayName = DesktopContract.ProductName;
        private readonly string _dllFileName;

        private IEnvironment _environment;

        private MultiSupplierMTOptions _mtOptions;

        private static readonly object _lock = new object();
        public MultiSupplierMTPluginDirector()
        {
            try
            {
                // 由于 Shadow Copy，必须使用文件名，而不是 Assembly 的名字，否则多重安装出错
                _dllFileName = Path.GetFileNameWithoutExtension(Assembly.GetExecutingAssembly().Location);
            }
            catch
            {
            }

            // 兼容 memoQ Server，但可能导致无法多重安装
            if (string.IsNullOrEmpty(_dllFileName))
                _dllFileName = Assembly.GetExecutingAssembly().GetName().Name;
        }

        #region IModule Members

        public bool IsActivated
        {   
            get { return true; }
        }

        public void Initialize(IModuleEnvironment env)
        {
            // 从 memoQ 8.2 开始，机器翻译插件不再管理（存储和加载）自己的设置，但显然接口更新没跟上，
            // 这里居然获取不到 PluginSettings，所以我们只能在 CreateEngine() 等能获取到配置的地方初始化。
        }

        public void Cleanup()
        {
            LoggingHelper.Dispose();
        }

        #endregion

        #region IPluginDirector Members

        public override bool InteractiveSupported
        {
            get { return true; }
        }

        public override bool BatchSupported
        {
            get { return true; }
        }

        public override bool SupportFuzzyForwarding 
        {
            get { return true; }
        }

        public override bool StoringTranslationSupported
        {
            get { return true; }
        }

        public override string PluginID
        {
            get { return _dllFileName; }
        }

        public override string FriendlyName
        {
            get 
            {
                if (_mtOptions == null)
                    return $"{ProductDisplayName}\r\n({_dllFileName})";

                if (_mtOptions.GeneralSettings.EnableCustomDisplayName)
                    return $"{_mtOptions.GeneralSettings.CustomDisplayName}\r\n({_dllFileName})";

                return $"{ProductDisplayName}\r\n({_dllFileName})";
            }
        }

        public override string CopyrightText
        {
            get { return $"{_dllFileName}, Copyright (C) LangLink Localization"; }
        }

        public override Image DisplayIcon
        {
            get 
            {
                // TODO 根据当前选的提供商，显示不同提供商的图标
                return Image.FromStream(Assembly.GetExecutingAssembly().GetManifestResourceStream("MultiSupplierMTPlugin.Icon.png"));
            }
        }

        public override IEnvironment Environment
        {
            set { this._environment = value; }
        }

        public override PluginSettings EditOptions(IWin32Window parentForm, PluginSettings settings)
        {
            var mtOptions = GetOrInitializeOptions(settings);

            using (var form = new MultiSupplierMTOptionsForm(mtOptions))
            {
                if (form.ShowDialog(parentForm) == DialogResult.OK)
                {
                    mtOptions.GeneralSettings.RuningTimes += 1;
                    _environment.PluginAvailabilityChanged();
                }
            }

            var version = Assembly.GetExecutingAssembly().GetName().Version.ToString();
            mtOptions.GeneralSettings.Version = version;
            mtOptions.GeneralSettings.Version = version;

            return mtOptions.GetSerializedSettings();
        }

        public override bool IsLanguagePairSupported(LanguagePairSupportedParams args)
        {
            var mtOptions = GetOrInitializeOptions(args.PluginSettings);
            return mtOptions.GeneralSettings.EnableGateway;
        }

        public override IEngine2 CreateEngine(CreateEngineParams args)
        {
            var mtOptions = GetOrInitializeOptions(args.PluginSettings);
            return new MultiSupplierMTEngine(mtOptions, mtOptions.GeneralSettings.RequestType, args.SourceLangCode, args.TargetLangCode);
        }

        #endregion

        private MultiSupplierMTOptions GetOrInitializeOptions(PluginSettings pluginSettings)
        {
            if (_mtOptions != null)
                return _mtOptions;

            lock (_lock)
            {
                if (_mtOptions != null)
                    return _mtOptions;

                var mtOptions = new MultiSupplierMTOptions(pluginSettings);

                var general = mtOptions.GeneralSettings;
                general.NormalizeForDesktopControlPlane();

                OptionsHelper.Init(mtOptions);

                LocalizedHelper.Init(general.UILanguage);

                LoggingHelper.Init(Path.Combine(general.DataDir, "Log"), _dllFileName, general.EnableStatsAndLog, general.LogLevel, general.LogRetentionDays);

                _mtOptions = mtOptions;

                return mtOptions;
            }
        }
    }
}
