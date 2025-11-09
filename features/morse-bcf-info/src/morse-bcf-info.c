#include <stdio.h>
#include <byteswap.h>
#include <stdlib.h>
#include <fcntl.h>
#include <string.h>
#include <libelf.h>
#include <gelf.h>
#include <unistd.h>
#include <stdint.h>
#include <stdbool.h>
#include <ctype.h>
#include <dirent.h>
#include <limits.h>


#define MAYBE_BSWAP(bits, a) (needs_bswap ? bswap_ ## bits(a) : (a))

const char *DEFAULT_PATH = "/lib/firmware/morse";

void emit_json_string(FILE *out, const char *str, size_t len) {
	if (!str) {
		fputs("null", out);
	}
	fputc('\"', out);
	for (size_t i = 0; str[i] && i < len; ++i) {
		switch (str[i]) {
			case '\"': fputs("\\\"", out); break;
			case '\\': fputs("\\\\", out); break;
			case '\b': fputs("\\b", out); break;
			case '\f': fputs("\\f", out); break;
			case '\n': fputs("\\n", out); break;
			case '\r': fputs("\\r", out); break;
			case '\t': fputs("\\t", out); break;
			default:
				if (isprint(str[i])) {
					fputc(str[i], out);
				} else {
					fprintf(out, "\\u%04x", str[i]);
				}
		}
	}
	fputc('\"', out);
}

const Elf_Data* get_section_data(Elf *e, const char *section_name, size_t *out_size, GElf_Shdr *out_hdr) {
	size_t shstrndx;
	elf_getshdrstrndx(e, &shstrndx);

	Elf_Scn *scn = NULL;
	while ((scn = elf_nextscn(e, scn)) != NULL) {
		GElf_Shdr shdr;
		if (gelf_getshdr(scn, &shdr) != &shdr) {
			fprintf(stderr, "gelf_getshdr failed: %s\n", elf_errmsg(-1));
			continue;
		}
		const char *name = elf_strptr(e, shstrndx, shdr.sh_name);
		if (!name) {
			fprintf(stderr, "gelf_getshdr failed: %s\n", elf_errmsg(-1));
			continue;
		}
		if (strcmp(name, section_name) == 0) {
			if (out_hdr) *out_hdr = shdr;
			const Elf_Data *data = elf_getdata(scn, NULL);
			if (data && out_size) *out_size = data->d_size;
			return data;
		}
	}
	return NULL;
}

void emit_separated_json_array(FILE *out, const char *buf, size_t len, const char *delims) {
	fputc('[', out);
	bool first = true;

	size_t start = 0;
	for (size_t i = 0; i <= len; ++i) {
		char c = (i < len) ? buf[i] : '\0';

		// Check if this character is a delimiter or end-of-buffer
		if (c == '\0' || strchr(delims, c)) {
			if (i > start) {
				if (!first) fputs(", ", out);
				first = false;
				emit_json_string(out, &buf[start], i - start);
			}
			start = i + 1;
		}
	}

	fputc(']', out);
}

void emit_regdom_json_array(FILE *out, Elf *e) {
	size_t shstrndx;
	elf_getshdrstrndx(e, &shstrndx);

	bool first = true;
	fputs("[", out);

	Elf_Scn *scn = NULL;
	while ((scn = elf_nextscn(e, scn)) != NULL) {
		GElf_Shdr shdr;
		gelf_getshdr(scn, &shdr);
		const char *section_name = elf_strptr(e, shstrndx, shdr.sh_name);

		if (strncmp(section_name, ".regdom_", 8) == 0) {
			const Elf_Data *data = elf_getdata(scn, NULL);
			if (!data || !data->d_buf || data->d_size < 12) continue;

			const char *name_ptr = (const char *)data->d_buf + 8;

			if (!first) fputs(", ", out);
			first = false;
			emit_json_string(out, name_ptr, 4);
		}
	}

	fputs("]", out);
}

int print_bcf_as_json(const char *filename) {
	int fd = open(filename, O_RDONLY);
	if (fd < 0) {
		puts("    \"error_message\": \"open() failed\"");
		return 1;
	}

	Elf *e = elf_begin(fd, ELF_C_READ, NULL);
	if (!e) {
		puts("    \"error_message\": \"elf_begin() failed\"");
		close(fd);
		return 1;
	}


	GElf_Ehdr ehdr;
	if (gelf_getehdr(e, &ehdr) == NULL) {
		printf("    \"error_message\": \"gelf_gethdr() failed: %s\"\n", elf_errmsg(-1));
		elf_end(e);
		close(fd);
		return 1;
	}

#if __BYTE_ORDER__ == __ORDER_BIG_ENDIAN__
	bool needs_bswap = ehdr.e_ident[EI_DATA] == ELFDATA2LSB;
#else
	bool needs_bswap = ehdr.e_ident[EI_DATA] == ELFDATA2MSB;
#endif

	size_t bcfdata_size;

	GElf_Shdr bcf_hdr;
	const Elf_Data *bcfdata = get_section_data(e, ".host_bcfmem", &bcfdata_size, &bcf_hdr);
	if (!bcfdata) bcfdata = get_section_data(e, ".board_config", &bcfdata_size, &bcf_hdr);

	if (!bcfdata || !bcfdata->d_buf || bcfdata_size < 16) {
		puts("    \"error_message\": \"BCF section missing or too small\"");
		elf_end(e);
		close(fd);
		return 1;
	}

	const uint32_t *buf = bcfdata->d_buf;

	printf("    \"magic_number\": \"0x%x\",\n",
				MAYBE_BSWAP(32, buf[0]));
	printf("    \"crc32\": \"0x%x\",\n",
				MAYBE_BSWAP(32, buf[1]));
	const uint8_t *semver = (const uint8_t *)&buf[2];
	printf("    \"semver\": { \"major\": %d, \"minor\": %d, \"patch\": %d },\n",
				MAYBE_BSWAP(16, *(const uint16_t *)semver), semver[2], semver[3]);
	printf("    \"length\": %u,\n",
				MAYBE_BSWAP(32, buf[3]));

	const Elf_Data *board_desc = get_section_data(e, ".board_desc", NULL, NULL);
	printf("    \"board_desc\": ");
	emit_json_string(stdout, board_desc ? (const char *)board_desc->d_buf : NULL, board_desc ? board_desc->d_size : 0);
	printf(",\n");

	const Elf_Data *chips = get_section_data(e, ".chips", NULL, NULL);
	printf("    \"chips\": ");
	emit_separated_json_array(stdout, chips ? (const char *)chips->d_buf : NULL, chips ? chips->d_size : 0, ",");
	printf(",\n");

	const Elf_Data *build_ver = get_section_data(e, ".build_ver", NULL, NULL);
	printf("    \"build_ver\": ");
	emit_separated_json_array(stdout, build_ver ? (const char *)build_ver->d_buf : NULL, build_ver ? build_ver->d_size : 0, "\n ");
	printf(",\n");

	printf("    \"regdoms\": ");
	emit_regdom_json_array(stdout, e);
	putchar('\n');

	elf_end(e);
	close(fd);

	return 0;
}


int main(int argc, char **argv) {
	if (elf_version(EV_CURRENT) == EV_NONE) {
		fprintf(stderr, "ELF library initialization failed.\n");
		return 1;
	}

	printf("{\n");

	if (argc > 1) {
		for (int i = 1; i < argc; ++i) {
			if (i > 1) {
				puts(",");
			}
			printf("  \"%s\": {\n", argv[i]);
			print_bcf_as_json(argv[i]);
			printf("  }");
		}
	} else {
		struct dirent *entry;
		DIR *dir = opendir(DEFAULT_PATH);
		if (dir != NULL) {
			bool first = true;
			while ((entry = readdir(dir)) != NULL) {
				const int length = strlen(entry->d_name);
				if (length > 4 && 0 == strcmp(entry->d_name + length - 4, ".bin")) {
					char path[PATH_MAX];
					snprintf(path, PATH_MAX, "%s/%s", DEFAULT_PATH, entry->d_name);
					if (!first) {
						puts(",");
					}
					first = false;
					printf("  \"%s\": {\n", path);
					print_bcf_as_json(path);
					printf("  }");
				}
			}
			closedir(dir);
		}
	}
	printf("\n}\n");

	return 0;
}
