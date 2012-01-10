/*
    Copyright (c) 2012 Jeff May

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
(function($)
{
    $.fn.selectRange = function(start, end) {
        return this.each(function() {
            var curstart, curend;
            if(start === undefined && end === undefined) {
                curstart = 0;
                curend = $(this).val().length;
            }
            else if(end === undefined) {
                curend = curstart = start;
            }
            else {
                curstart = start;
                curend = end;
            }
            if (this.setSelectionRange) {
                this.focus();
                this.setSelectionRange(curstart, curend);
            } else if (this.createTextRange) {
                var range = this.createTextRange();
                range.collapse(true);
                range.moveEnd('character', curend);
                range.moveStart('character', curstart);
                range.select();
            }
        });
    };

    $.fn.WordTokenizer = function() {
        if(typeof arguments[0] == 'string') {
            var args = Array.prototype.slice.call(arguments);
            var method = args.shift();
            return $(this).data('WordTokenizer')[method](args);
        }
        else {
            var params = arguments[0];
            return this.each(function() {
                new WordTokenizer(this, params);
            });
        }
    };

    function WordTokenizer(element, params) {
        var node = $(element);
        if(node == null) {
            throw "Could not find element with id, '" + id + "'";
        }
        var self = this;
        $.extend(true, self, {

            options: $.extend({
                invalidTokenClass: 'invalid-token',
                invalidActionClass: 'invalid-action',
                highlightTokenClass: 'highlight-token',
                onDelete: null,
                displayDelimiter: '', // (Not implemented)
                valueDelimiter: ',', // Used to delimit the combined tokens when storing the value to the given element
                createTokenKeyCodes: [9, 13, 32, 188], // Determines which keys will create a new token
                validator: function(str) {
                    // By default, don't do any validation
                    return str != '';
                }
            }, params),

            init: function() {
                // Clone the input field and get all the events
                var tokenize;
                self.field = node.clone(true)
                    .attr({
                        // Replace the id and name, so it doesn't conflict
                        id: node[0].id + '_WordTokenizer',
                        name: node[0].name + '_display'
                    })
                    .keydown(function(keyEvent) {
                        var empty = self.field.val() == '';
                        var code = keyEvent.which;
                        if(empty && (code == 9 || code == 13)) {
                            // Propagate the tab if the field is empty
                            return true;
                        }
                        if(!empty && self.options.createTokenKeyCodes.indexOf(code) >= 0) {
                            // TODO: Fix a bug in Firefox that causes this to fire when pressing enter to autocomplete
                            self.tokenize();
                            return false;
                        }
                        else if(code == 8 && empty) {
                            self.selectToken(-1);
                            return false;
                        }
                    })
                    .keyup(function() {
                        self.validate()
                    })
                    .change(self.tokenize)
                    .insertBefore(node.hide())
                ;

                // Transfer some information to the tokenizer
                node.focus(function() {
                    self.field.focus.apply(self, arguments);
                });
                // Create token list
                self.tokenList = $('<div class="wt-tokenList"></div>');
                self.tokenWrapper = $('<div class="wt-tokenWrapper"></div>')
                    .append(self.tokenList).insertAfter(self.field)
                ;
                self.tokenWrapper.append(self.field);
                node.data('WordTokenizer', self);
                self.addTokens(self.field.val());
            },

            addTokens: function(tokens) {
                var tokenValues;
                if(typeof tokens == 'string') {
                    tokenValues = $.map(tokens.split(','), function(str) {
                        var addr = $.trim(str);
                        if(addr.length == 0) {
                            return null;
                        }
                        else {
                            return addr;
                        }
                    });
                }
                else {
                    tokenValues = tokens;
                }
                // TODO: Support adding token jQuery objects
                var tokenArray = new Array(tokenValues.length);
                for(var i=0; i<tokenValues.length; i++) {
                    var email = tokenValues[i];
                    var token = $('<span class="token"/>')
                        .data('email', email)
                        .click(function() {
                            self.selectToken($(this).data('email'));
                        })
                        .append('<span>' + email + '</span>')
                        .append($('<button type="button" class="close-token">X</button>')
                            .button()
                            .click(function() {
                                self.removeToken($(this).closest('*.token').data('email'), false);
                            })
                        )
                        .keydown(function(keyEvent) {
                            var code = keyEvent.which;
                            if(token.hasClass(self.options.highlightTokenClass) &&
                                    (code == 8 || code == 46))
                            {
                                self.removeToken($(this).data('email'), true);
                                return false;
                            }
                        })
                    ;
                    tokenArray[i] = token[0];
                }
                self.tokenList.append($(tokenArray));
                if($.isFunction(self.options.onDelete)) {
                    self.tokenList.delegate('*.token', 'delete', self.options.onDelete)
                }
                self.field.val('');
                self.refreshValue();
            },

            getToken: function(id) {
                if(typeof id == 'number') {
                    return self.tokenList.children().eq(id);
                }
                else if(typeof id == 'string') {
                    return self.tokenList.children().filter(function() {
                        return self.parseTokenValue(this) == id;
                    });
                }
                else {
                    var el = $(id);
                    if(el.hasClass('token')) {
                        return el;
                    }
                    else {
                        throw "TypeError: getToken() takes an integer index, the string email address, or a token selector for the id";
                    }
                }
            },

            getTokens: function() {
                var arr = new Array();
                self.tokenList.children().each(function() {
                    var token = self.parseTokenValue(this);
                    if (token != null && token != "") {
                        arr.push(token);
                    }
                });
                return arr;
            },

            removeToken: function(id, editIfEmpty) {
                var token = self.getToken(id);
                var email = self.parseTokenValue(token);
                if(self.field.val() == '' && editIfEmpty) {
                    self.field.val(email).selectRange();
                }
                token.trigger('delete', email).remove();
                self.refreshValue();
                self.field.focus();
            },

            selectToken: function(id) {
                var token = self.getToken(id);
                token.siblings().removeClass(self.options.highlightTokenClass);
                token.addClass(self.options.highlightTokenClass);
                token.find('*.close-token').focus();
            },

            refreshValue: function() {
                node.val(self.getTokens().join(self.options.valueDelimiter));
            },

            // TODO: Use a validation event
            validate: function() {
                var valid = self.field.val() == '' || self.options.validator(self.field.val());
                var markedAsInvalid = self.field.hasClass(self.options.invalidTokenClass);
                if(valid && markedAsInvalid) {
                    self.field.removeClass(self.options.invalidTokenClass);
                }
                else if(!valid && !markedAsInvalid) {
                    self.field.addClass(self.options.invalidTokenClass);
                }
            },

            tokenize: function() {
                if(self.options.validator(self.field.val())) {
                    // Check for duplicate tokens
                    var i = $.inArray(self.field.val(), self.getTokens());
                    if(i >= 0) {
                        // Flash both the field and the duplicate token
                        flashClass(self.options.invalidActionClass, self.getToken(i).add(self.field));
                    }
                    else {
                        self.addTokens(self.field.val());
                        self.field.val('');
                    }
                }
                else {
                    flashClass(self.options.invalidActionClass, self.field);
                }
            }
        });

        function flashClass(className, selector) {
            $(selector).addClass(className);
            setTimeout(function() {
                $(selector).removeClass(className);
            }, 200);
        }

        self.init();
    }

    WordTokenizer.prototype.parseTokenValue = function(tokenNode) {
        var val = null;
        if(tokenNode.length === undefined) {
            val = tokenNode.childNodes[0].innerHTML;
        }
        else {
            val = tokenNode.find('>*:first-child').text();
        }
        return val;
    };

})(jQuery);
