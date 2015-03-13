(function(exports) {

exports.FuzzySearch = FuzzySearch;

function FuzzySearch(strings)
{
	this.strings = [];
	this.strings_lc = [];
	this.dictionaries = {};

	if (strings)
		this.add_strings(strings);

	for (var d in this.dictionaries)
		this.dictionaries[d].sort(cmp_number);
}

FuzzySearch.prototype.add_strings = function(strings)
{
	strings.forEach(function(s) { this.add_string(s); }.bind(this));
}

FuzzySearch.prototype.add_string = function(s)
{
	var lower = s.toLowerCase();
	var index = this.strings.length;
	var chars = str_chars(lower);

	this.strings.push(s);
	this.strings_lc.push(lower);

	for (var i = 0, n = chars.length; i < n; i++)
		(this.dictionaries[chars[i]] || (this.dictionaries[chars[i]] = [])).push(index);
}

FuzzySearch.prototype.find = function(text)
{
	var dicts = this.dictionaries;
	var strings = this.strings;
	var strings_lc = this.strings_lc;
	var lower = text.toLowerCase();
	var chars = str_chars(lower);
	var empty = false;

	dicts = chars.map(function(ch) { return dicts[ch] || (empty = true); });

	if (empty || dicts.length === 0)
		return [];

	var matches = null;

	if (lower.length === 1)
	{
		matches = dicts[0].map(function(i) { return strings[i]; });
		matches.sort();
	}
	else
	{
		var re = new RegExp(lower.split("").join(".*"));
		var subset = dicts.slice(1).reduce(intersection, dicts[0]);

		matches = subset.filter(function(i) { return re.test(strings_lc[i]); });

		matches.sort(function(a, b) {
			var sa = strings_lc[a];
			var sb = strings_lc[b];
			var sa_lc = strings_lc[a];
			var sb_lc = strings_lc[b];
			var aa = +(sa_lc.indexOf(lower) !== -1);
			var bb = +(sb_lc.indexOf(lower) !== -1);

			return (bb - aa) || (sa < sb ? -1 : +(sa > sb));
		});

		matches = matches.map(function(i) { return strings[i]; });
	}

	return matches;
}

function str_chars(s)
{
	var list = {};

	for (var i = 0, n = s.length; i < n; i++)
		list[s.charAt(i)] = 1;

	return Object.keys(list);
}

function cmp_number(a, b)
{
	return a - b;
}

function intersection(a, b)
{
	var ai = 0, an = a.length;
	var bi = 0, bn = b.length;
	var result = [];

	while (ai < an && bi < bn)
	{
		if (a[ai] < b[bi])
			ai++;
		else if (a[ai] > b[bi])
			bi++;
		else
			result.push(a[ai++]), bi++;
	}

	return result;
}

}(this));
