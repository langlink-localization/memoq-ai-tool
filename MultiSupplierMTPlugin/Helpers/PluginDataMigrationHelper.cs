using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace MultiSupplierMTPlugin
{
    static class PluginDataMigrationHelper
    {
        private const string LegacyDataSubFolder = "MultiSupplierMTPlugin";
        private const string DefaultDataRootFolder = "MemoQ";

        public static void EnsureLegacyDataMigrated(string currentDataDir, string currentAssemblyPrefix)
        {
            if (string.IsNullOrWhiteSpace(currentDataDir))
                return;

            var homeDataDir = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            if (string.IsNullOrWhiteSpace(homeDataDir))
                return;

            var legacyDataDir = Path.Combine(homeDataDir, DefaultDataRootFolder, LegacyDataSubFolder);
            if (!Directory.Exists(legacyDataDir))
                return;

            var normalizedCurrent = NormalizePath(currentDataDir);
            var normalizedLegacy = NormalizePath(legacyDataDir);
            if (string.Equals(normalizedCurrent, normalizedLegacy, StringComparison.OrdinalIgnoreCase))
                return;

            if (!Directory.Exists(currentDataDir))
            {
                try
                {
                    Directory.CreateDirectory(currentDataDir);
                }
                catch
                {
                    return;
                }
            }

            CopyDirectoryContents(legacyDataDir, currentDataDir, false);
            MigrateLegacyTranslationsDb(legacyDataDir, currentDataDir, currentAssemblyPrefix);
        }

        private static void MigrateLegacyTranslationsDb(string legacyDataDir, string currentDataDir, string currentAssemblyPrefix)
        {
            if (string.IsNullOrWhiteSpace(currentAssemblyPrefix))
                return;

            var sourceDir = Path.Combine(legacyDataDir, "Cache", "Translation");
            var targetDir = Path.Combine(currentDataDir, "Cache", "Translation");

            if (!Directory.Exists(sourceDir) || !Directory.Exists(targetDir))
                return;

            var sourceDbFiles = GetDbFiles(sourceDir);

            foreach (var sourceDb in sourceDbFiles)
            {
                var sourceName = Path.GetFileName(sourceDb);
                if (string.IsNullOrWhiteSpace(sourceName))
                    continue;

                if (!sourceName.EndsWith(".db", StringComparison.OrdinalIgnoreCase))
                    continue;

                var legacyNameWithoutExt = Path.GetFileNameWithoutExtension(sourceName);
                if (!legacyNameWithoutExt.StartsWith(LegacyDataSubFolder, StringComparison.OrdinalIgnoreCase))
                    continue;

                var suffix = legacyNameWithoutExt.Length > LegacyDataSubFolder.Length
                    ? legacyNameWithoutExt.Substring(LegacyDataSubFolder.Length)
                    : string.Empty;

                var mappedTargetName = string.IsNullOrWhiteSpace(suffix)
                    ? currentAssemblyPrefix + ".db"
                    : $"{currentAssemblyPrefix}{suffix}.db";

                var mappedTargetPath = Path.Combine(targetDir, mappedTargetName);
                if (!File.Exists(mappedTargetPath))
                {
                    TryCopyFile(sourceDb, mappedTargetPath);
                }
            }
        }

        private static IEnumerable<string> GetDbFiles(string dbDir)
        {
            try
            {
                return Directory.GetFiles(dbDir, "*.db", SearchOption.TopDirectoryOnly).ToList();
            }
            catch
            {
                return Array.Empty<string>();
            }
        }

        private static void CopyDirectoryContents(string sourceDir, string targetDir, bool overwriteExisting)
        {
            if (!Directory.Exists(sourceDir))
                return;

            Directory.CreateDirectory(targetDir);

            foreach (var dir in Directory.EnumerateDirectories(sourceDir, "*", SearchOption.AllDirectories))
            {
                var relative = GetRelativePathCompat(sourceDir, dir);
                try
                {
                    Directory.CreateDirectory(Path.Combine(targetDir, relative));
                }
                catch
                {
                    // keep going when directory operations fail
                }
            }

            foreach (var file in Directory.EnumerateFiles(sourceDir, "*", SearchOption.AllDirectories))
            {
                var relative = GetRelativePathCompat(sourceDir, file);
                var dest = Path.Combine(targetDir, relative);

                if (!overwriteExisting && File.Exists(dest))
                    continue;

                TryCopyFile(file, dest);
            }
        }

        private static void TryCopyFile(string source, string target)
        {
            try
            {
                var parent = Path.GetDirectoryName(target);
                if (!string.IsNullOrWhiteSpace(parent))
                    Directory.CreateDirectory(parent);

                File.Copy(source, target, overwrite: true);
            }
            catch
            {
                // keep service startup independent from migration issues
            }
        }

        private static string NormalizePath(string path)
        {
            try
            {
                return Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            }
            catch
            {
                return path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            }
        }

        private static string GetRelativePathCompat(string basePath, string targetPath)
        {
            if (string.IsNullOrWhiteSpace(basePath) || string.IsNullOrWhiteSpace(targetPath))
                return string.Empty;

            try
            {
                var baseDir = EnsureTrailingSeparator(NormalizePath(basePath));
                var baseUri = new Uri(baseDir);
                var targetUri = new Uri(NormalizePath(targetPath));
                var relative = Uri.UnescapeDataString(baseUri.MakeRelativeUri(targetUri).ToString());
                return relative.Replace('/', Path.DirectorySeparatorChar);
            }
            catch
            {
                return Path.GetFileName(targetPath) ?? string.Empty;
            }
        }

        private static string EnsureTrailingSeparator(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return string.Empty;

            if (path.EndsWith(Path.DirectorySeparatorChar.ToString(), StringComparison.Ordinal) ||
                path.EndsWith(Path.AltDirectorySeparatorChar.ToString(), StringComparison.Ordinal))
            {
                return path;
            }

            return path + Path.DirectorySeparatorChar;
        }
    }
}
