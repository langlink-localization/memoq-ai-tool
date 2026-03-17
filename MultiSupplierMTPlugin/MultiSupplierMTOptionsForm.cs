using MultiSupplierMTPlugin.Forms;
using MultiSupplierMTPlugin.Helpers;
using MultiSupplierMTPlugin.Localized;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using LLH = MultiSupplierMTPlugin.Localized.LocalizedHelper;
using LLK = MultiSupplierMTPlugin.MultiSupplierMTOptionsFormLocalizedKey;
using LLKC = MultiSupplierMTPlugin.Localized.LocalizedKeyCommon;

namespace MultiSupplierMTPlugin
{
    partial class MultiSupplierMTOptionsForm : Form
    {
        private class ComboBoxItem
        {
            public string DisplayText { get; set; }
            public object ValueObj { get; set; }

            public ComboBoxItem(string displayText, object valueObj)
            {
                DisplayText = displayText;
                ValueObj = valueObj;
            }

            public override string ToString()
            {
                return DisplayText;
            }
        }


        private MultiSupplierMTOptions _mtOptions;

        private MultiSupplierMTGeneralSettings _mtGeneralSettings;

        private MultiSupplierMTSecureSettings _mtSecureSettings;
        private readonly GatewayTranslationClient _gatewayClient;

        private RequestType _lastRequestType;
        private bool _canUpdateLastRequestType = true;

        private const string DesktopProviderName = DesktopContract.DesktopProviderName;


        public MultiSupplierMTOptionsForm(MultiSupplierMTOptions mtOptions)
        {
            InitializeComponent();

            this._mtOptions = mtOptions;

            this._mtGeneralSettings = mtOptions.GeneralSettings;
            this._mtSecureSettings = mtOptions.SecureSettings;
            this._gatewayClient = new GatewayTranslationClient(this._mtGeneralSettings);
        }


        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);

            Localized();

            LoadOptions();
            ConfigureDesktopOnlyLayout();
            LoadDesktopStatusAsync();
        }


        private void Localized()
        {
            var version = Assembly.GetExecutingAssembly().GetName().Version.ToString();
            Text = LLH.G(LLK.Form) + $" v{version}";

            linkLabelProvider.Text = LLH.G(LLK.LinkLabelProvider);

            linkLabelRequestType.Text = LLH.G(LLK.LinkLabelRequestType);

            checkBoxTagsToEnd.Text = LLH.G(LLK.CheckBoxTagsToEnd);
            checkBoxNormalizeWhitespace.Text = LLH.G(LLK.CheckBoxNormalizeWhitespace);

            linkLabelCustomRequestLimit.Text = LLH.G(LLK.LinkLabelCustomRequestLimit);
            linkLabelCustomDisplayName.Text = LLH.G(LLK.LinkLabelCustomDisplayName);
            linkLabelStatsAndLog.Text = LLH.G(LLK.LinkLabelStatsAndLog);
            linkLabelTranslateCache.Text = LLH.G(LLK.LinkLabelTranslateCache);

            buttonOK.Text = LLH.G(LLKC.ButtonOK);
            buttonCancel.Text = LLH.G(LLKC.ButtonCancel);
            buttonGithub.Text = LLH.G(LLKC.ButtonGithub);
        }

        private void LoadOptions()
        {
            _mtGeneralSettings.NormalizeForDesktopControlPlane();

            comboBoxServiceProvider.DisplayMember = "DisplayText";
            comboBoxServiceProvider.ValueMember = "ValueObj";
            var services = GetDesktopOnlyServices();
            comboBoxServiceProvider.DataSource = new BindingList<ComboBoxItem>(services);
            SelectComboBoxServiceProvider(DesktopProviderName);
            comboBoxRequestType.DisplayMember = "DisplayText";
            comboBoxRequestType.ValueMember = "ValueObj";

            var requestTypes = GetRequestTypes(true, true);
            comboBoxRequestType.DataSource = new BindingList<ComboBoxItem>(requestTypes);
            SelectComboBoxRequestType(_mtGeneralSettings.RequestType);
            //同理，这里也会始终得到一个值
            _lastRequestType = (RequestType)comboBoxRequestType.SelectedValue;

            checkBoxTagsToEnd.Checked = _mtGeneralSettings.InsertRequiredTagsToEnd;
            checkBoxNormalizeWhitespace.Checked = _mtGeneralSettings.NormalizeWhitespaceAroundTags;
            SetCheckBoxState(_lastRequestType);

            checkBoxCustomRequestLimit.Checked = _mtGeneralSettings.EnableCustomRequestLimit;
            checkBoxCustomDisplayName.Checked = _mtGeneralSettings.EnableCustomDisplayName;
            checkBoxStatsAndLog.Checked = _mtGeneralSettings.EnableStatsAndLog;
            checkBoxTranslateCache.Checked = _mtGeneralSettings.EnableCache;

            comboBoxServiceProvider.Visible = false;
            linkLabelProvider.Visible = false;

            // 至少包含 en-US 和 zh-CN 两种内置语言
            var languages = LLH.GetAvailableLanguages();
            comboBoxLanguages.Items.AddRange(languages);
            comboBoxLanguages.SelectedItem = languages.Contains(LLH.UILanguage) ? LLH.UILanguage : "en-US";

            this.comboBoxRequestType.SelectedIndexChanged += new System.EventHandler(this.comboBoxRequestType_SelectedIndexChanged);
            this.comboBoxLanguages.SelectedIndexChanged += new System.EventHandler(this.comboBoxLanguages_SelectedIndexChanged);
        }

        private void ConfigureDesktopOnlyLayout()
        {
            comboBoxServiceProvider.Visible = false;
            linkLabelProvider.Visible = true;
            linkLabelProvider.LinkBehavior = LinkBehavior.NeverUnderline;
            linkLabelProvider.LinkColor = System.Drawing.SystemColors.ControlText;
            linkLabelProvider.ActiveLinkColor = System.Drawing.SystemColors.ControlText;
            linkLabelProvider.VisitedLinkColor = System.Drawing.SystemColors.ControlText;
            linkLabelProvider.Text = "Checking desktop status...";
            linkLabelProvider.AutoSize = false;
            linkLabelProvider.Width = 580;
            linkLabelProvider.Height = 36;

            checkBoxCustomRequestLimit.Visible = false;
            linkLabelCustomRequestLimit.Visible = false;
            checkBoxCustomDisplayName.Visible = false;
            linkLabelCustomDisplayName.Visible = false;
            checkBoxStatsAndLog.Visible = false;
            linkLabelStatsAndLog.Visible = false;
            checkBoxTranslateCache.Visible = false;
            linkLabelTranslateCache.Visible = false;

            buttonGithub.Text = "Open Desktop";
        }

        private async void LoadDesktopStatusAsync()
        {
            try
            {
                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
                {
                    var version = await _gatewayClient.GetDesktopVersionAsync(cts.Token);
                    linkLabelProvider.Text = $"{version.ProductName} connected. Desktop {version.DesktopVersion}, contract {version.ContractVersion}.";
                }
            }
            catch (Exception ex)
            {
                linkLabelProvider.Text = $"Desktop app is not reachable. Start the local desktop app and try again. ({ex.Message})";
            }
        }

        private void comboBoxRequestType_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (comboBoxRequestType.SelectedValue is RequestType selectedRequestType)
            {
                // 用户手动变更的才要更新，由于提供商改变而变更的不要更新
                if (_canUpdateLastRequestType)
                    _lastRequestType = selectedRequestType;

                // 但无论哪种方式引起的变更，都需要更新 CheckBox
                SetCheckBoxState(selectedRequestType);
            }
        }


        private void SetCheckBoxState(RequestType selectedRequestType)
        {
            bool checkBoxTagsToEndEnabled =
                        selectedRequestType == RequestType.Plaintext ||
                        selectedRequestType == RequestType.OnlyFormattingWithXml ||
                        selectedRequestType == RequestType.OnlyFormattingWithHtml;

            checkBoxTagsToEnd.Enabled = checkBoxTagsToEndEnabled;
            checkBoxNormalizeWhitespace.Enabled = !checkBoxTagsToEndEnabled;

            checkBoxTagsToEndFake.Visible = !checkBoxTagsToEndEnabled;
            checkBoxNormalizeWhitespaceFake.Visible = checkBoxTagsToEndEnabled;
        }


        private ComboBoxItem[] GetDesktopOnlyServices()
        {
            var item = new ComboBoxItem(DesktopContract.ProductName, DesktopProviderName);
            return new[] { item };
        }

        private void ReloadComboBoxServiceProvider()
        {
            var services = GetDesktopOnlyServices();
            comboBoxServiceProvider.DataSource = new BindingList<ComboBoxItem>(services);

            SelectComboBoxServiceProvider(DesktopProviderName);
        }

        private ComboBoxItem[] GetRequestTypes(bool xmlSupported, bool htmlSupported)
        {
            List<ComboBoxItem> requstsTypes = new List<ComboBoxItem>();

            //需要顺序，先 Plaintext
            requstsTypes.Add(new ComboBoxItem(LLH.G(LLK.ComboBoxRequestType_Plaintext), RequestType.Plaintext));

            //接着 OnlyFormatting
            if (xmlSupported || !_mtGeneralSettings.ShowSupportedRequestTypeOnly)
            {
                requstsTypes.Add(new ComboBoxItem(LLH.G(LLK.ComboBoxRequestType_OnlyFormattingWithXml), RequestType.OnlyFormattingWithXml));
            }
            if (htmlSupported || !_mtGeneralSettings.ShowSupportedRequestTypeOnly)
            {
                requstsTypes.Add(new ComboBoxItem(LLH.G(LLK.ComboBoxRequestType_OnlyFormattingWithHtml), RequestType.OnlyFormattingWithHtml));
            }

            //然后 BothFormattingAndTags
            if (xmlSupported || !_mtGeneralSettings.ShowSupportedRequestTypeOnly)
            {
                requstsTypes.Add(new ComboBoxItem(LLH.G(LLK.ComboBoxRequestType_BothFormattingAndTagsWithXml), RequestType.BothFormattingAndTagsWithXml));
            }
            if (htmlSupported || !_mtGeneralSettings.ShowSupportedRequestTypeOnly)
            {
                requstsTypes.Add(new ComboBoxItem(LLH.G(LLK.ComboBoxRequestType_BothFormattingAndTagsWithHtml), RequestType.BothFormattingAndTagsWithHtml));
            }

            return requstsTypes.ToArray();
        }

        private void SelectComboBoxServiceProvider(string name)
        {
            foreach (ComboBoxItem item in comboBoxServiceProvider.Items)
            {
                if ((string)item.ValueObj == name)
                {
                    comboBoxServiceProvider.SelectedIndex = -1;
                    comboBoxServiceProvider.SelectedItem = item;
                    return;
                }
            }

            if (comboBoxServiceProvider.Items.Count > 0)
            {
                //先清除再选才能触发 SelectedIndexChanged 绑定事件
                comboBoxServiceProvider.SelectedIndex = -1;
                comboBoxServiceProvider.SelectedIndex = 0;
            }
        }

        private void SelectComboBoxRequestType(RequestType requestType)
        {
            foreach (ComboBoxItem item in comboBoxRequestType.Items)
            {
                if ((RequestType)item.ValueObj == requestType)
                {
                    comboBoxRequestType.SelectedIndex = -1;
                    comboBoxRequestType.SelectedItem = item;
                    return;
                }
            }

            if (comboBoxRequestType.Items.Count > 0)
            {
                //先清除再选才能触发 SelectedIndexChanged 绑定事件
                comboBoxRequestType.SelectedIndex = -1;
                comboBoxRequestType.SelectedIndex = 0;
            }
        }

        private void linkLabelCustomRequestLimit_LinkClicked(object sender, LinkLabelLinkClickedEventArgs e)
        {
            // Request limits are managed by the desktop app.
        }

        private void linkLabelCustomDisplayName_LinkClicked(object sender, LinkLabelLinkClickedEventArgs e)
        {
            // Display name customization is managed by the desktop app.
        }

        private void linkLabelStatsAndLog_LinkClicked(object sender, LinkLabelLinkClickedEventArgs e)
        {
            // Logging is managed by the desktop app.
        }

        private void linkLabelTranslateCache_LinkClicked(object sender, LinkLabelLinkClickedEventArgs e)
        {
            // Cache is managed by the desktop app.
        }

        private void linkLabelProvider_LinkClicked(object sender, LinkLabelLinkClickedEventArgs e)
        {
            LoadDesktopStatusAsync();
        }

        private void linkLabelRequestType_LinkClicked(object sender, LinkLabelLinkClickedEventArgs e)
        {
            // Request type editing is handled directly in the simplified form.
        }

        private void comboBoxLanguages_SelectedIndexChanged(object sender, EventArgs e)
        {
            LLH.Init((string)comboBoxLanguages.SelectedItem);
            Localized();
            ReloadComboBoxServiceProvider();
            ConfigureDesktopOnlyLayout();
            LoadDesktopStatusAsync();
        }

        private void buttonGithub_Click(object sender, EventArgs e)
        {
            try
            {
                Process.Start(_mtGeneralSettings.GatewayBaseUrl);
            }
            catch
            {
                // do nothing
            }
        }


        private void MultiSupplierMTOptionsForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (DialogResult == DialogResult.OK)
            {
                _mtGeneralSettings.NormalizeForDesktopControlPlane();
                _mtGeneralSettings.CurrentServiceProvider = DesktopProviderName;
                _mtGeneralSettings.EnableCustomRequestLimit = false;
                _mtGeneralSettings.EnableCustomDisplayName = false;
                _mtGeneralSettings.EnableStatsAndLog = false;
                _mtGeneralSettings.EnableCache = false;

                _mtGeneralSettings.RequestType = (RequestType)comboBoxRequestType.SelectedValue;

                _mtGeneralSettings.InsertRequiredTagsToEnd = checkBoxTagsToEnd.Checked;
                _mtGeneralSettings.NormalizeWhitespaceAroundTags = checkBoxNormalizeWhitespace.Checked;

                _mtGeneralSettings.UILanguage = (string)comboBoxLanguages.SelectedItem;

                LoggingHelper.Enable = false;
            }
        }
    }

    class MultiSupplierMTOptionsFormLocalizedKey : LocalizedKeyBase
    {
        public MultiSupplierMTOptionsFormLocalizedKey(string name) : base(name)
        {
        }

        static MultiSupplierMTOptionsFormLocalizedKey()
        {
            AutoInit<MultiSupplierMTOptionsFormLocalizedKey>();
        }

        [LocalizedValue("4ec208c3-410c-4daa-8cb7-8a1dbc8d9b13", "Multi Supplier MT Plugin", "多提供商机器翻译插件")]
        public static MultiSupplierMTOptionsFormLocalizedKey Form { get; private set; }

        [LocalizedValue("d5b68680-860a-43b6-a34f-f9b06672361c", "Provider", "提供商")]
        public static MultiSupplierMTOptionsFormLocalizedKey LinkLabelProvider { get; private set; }

        [LocalizedValue("98f52dda-407e-4558-bb5b-c5d1be9bae2a", "Request Type", "请求类型")]
        public static MultiSupplierMTOptionsFormLocalizedKey LinkLabelRequestType { get; private set; }

        [LocalizedValue("4f5424da-0e9b-4248-9a34-68846494ba2a", "Insert Required Tags To End", "将原文中的内联标签追加到译文后")]
        public static MultiSupplierMTOptionsFormLocalizedKey CheckBoxTagsToEnd { get; private set; }

        [LocalizedValue("c2c08303-5d5d-4341-84cf-0b4c7eb61a7f", "Normalize Whitespace Around Tags", "归一化译文中内联标签旁边的空格")]
        public static MultiSupplierMTOptionsFormLocalizedKey CheckBoxNormalizeWhitespace { get; private set; }

        [LocalizedValue("f2a12541-8aef-4ef2-8544-87762cb08c36", "Enable Custom Request Limit", "启用自定义请求限制")]
        public static MultiSupplierMTOptionsFormLocalizedKey LinkLabelCustomRequestLimit { get; private set; }

        [LocalizedValue("bac7187e-1367-4ffb-a8e9-439d30267790", "Enable Custom Display Name", "启用自定义显示名称")]
        public static MultiSupplierMTOptionsFormLocalizedKey LinkLabelCustomDisplayName { get; private set; }

        [LocalizedValue("63604532-cd5c-4ef8-af3d-3540dc6e3acc", "Enable Stats And Log", "启用统计和日志")]
        public static MultiSupplierMTOptionsFormLocalizedKey LinkLabelStatsAndLog { get; private set; }

        [LocalizedValue("73f9781d-d68f-45fa-bcc4-032e077895ed", "Enable Translate Cache", "启用翻译缓存")]
        public static MultiSupplierMTOptionsFormLocalizedKey LinkLabelTranslateCache { get; private set; }


        [LocalizedValue("eb2b3011-77f5-498c-b3eb-15719ec439be", "Plaintext", "仅纯文本")]
        public static MultiSupplierMTOptionsFormLocalizedKey ComboBoxRequestType_Plaintext { get; private set; }

        [LocalizedValue("f926c81f-7e8c-4d93-819a-90d67f61e8f9", "Include Formatting With Xml", "包括格式标记，（用 Xml 表示）")]
        public static MultiSupplierMTOptionsFormLocalizedKey ComboBoxRequestType_OnlyFormattingWithXml { get; private set; }

        [LocalizedValue("ed3b6ee6-f020-4f97-ae01-b5e3f139cd60", "Include Formatting With Html", "包括格式标记，（用 Html 表示）")]
        public static MultiSupplierMTOptionsFormLocalizedKey ComboBoxRequestType_OnlyFormattingWithHtml { get; private set; }

        [LocalizedValue("095b951d-6052-4a60-a235-7ef4c08a31ef", "Include Formatting And Tags With Xml", "包括格式标记和内联标签，（用 Xml 表示）")]
        public static MultiSupplierMTOptionsFormLocalizedKey ComboBoxRequestType_BothFormattingAndTagsWithXml { get; private set; }

        [LocalizedValue("7699f7c8-f881-4fc1-b3d6-26f6fb3886ad", "Include Formatting And Tags With Html", "包括格式标记和内联标签，（用 Html 表示）")]
        public static MultiSupplierMTOptionsFormLocalizedKey ComboBoxRequestType_BothFormattingAndTagsWithHtml { get; private set; }
    }
}
