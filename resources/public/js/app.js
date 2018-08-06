(function (window, document) {
  const Rx = window.rxjs; // rxjs
  const R = window.R; // ramda
  const { operators } = Rx;
  const { ajax } = Rx.ajax;


  // Store Setup
  // ---------------------------------------------------------------------------

  function combineEpics (...epics) {
    return (action$, state$, deps) => Rx.from(epics)
      .pipe(
        operators.flatMap(epic => epic(action$, state$, deps))
      );
  }

  function combineReducers (reducers) {
    return (state, action) => {
      return R
        .toPairs(reducers)
        .reduce(
          (state, [ key, reducer ]) => {
            const current = state[key];
            const next = reducer(current, action);

            return current === next ? state : R.assoc(key, next, state);
          },
          state
        );
    };
  }

  function createReducer(handlers) {
    return (state=handlers.initial, action) => {
      if (handlers[action.type]) {
        return handlers[action.type](state, action);
      }

      return state;
    };
  }

  function delayAtLeast (delay) {
    return stream => {
      return Rx.combineLatest(stream, Rx.timer(delay))
        .pipe(operators.map(R.head));
    }
  }

  const createAction = R.curry(function createAction (type, data) {
    return { type, data };
  });

  const ofType = types => action => [].concat(types).includes(action.type);

  // Store
  // ---------------------------------------------------------------------------
  const actions = {
    REQUEST_SIGNUP: "signup/request",
    SIGNUP_ERRORS: "signup/errors",
    SIGNUP_SUCCESS: "signup/success",
    SUBMIT: "signup/form/submit",
    UPDATE_FORM: "signup/form/update",
  };

  const deps = {
    window,
  };

  const reducer = combineReducers({
    is_loading: createReducer({
      initial: false,
      [actions.REQUEST_SIGNUP]: R.T,
      [actions.SIGNUP_SUCCESS]: R.F,
      [actions.SIGNUP_ERRORS]: R.F,
    }),
    errors: createReducer({
      initial: [],
      [actions.REQUEST_SIGNUP]: () => [],
      [actions.SIGNUP_SUCCESS]: () => [],
      [actions.SIGNUP_ERRORS]: (state, action) =>
        R.uniq(state.concat(action.data)),
    }),
    form: createReducer({
      initial: {
        first_name: "",
        last_name: "",
        email: "",
      },
      [actions.UPDATE_FORM]: (state, action) =>
        R.mergeDeepRight(state, action.data),
      [actions.SIGNUP_SUCCESS]: (state, action) => ({
        name: "",
        email: "",
      })
    }),
    user: createReducer({
      initial: {},
      [actions.SIGNUP_SUCCESS]: (state, action) =>
        R.mergeDeepRight(state, action.data),
    }),
    view: createReducer({
      initial: "form",
      [actions.SIGNUP_SUCCESS]: () => "confirm",
    })
  })

  function submitEpic (action$, state$) {
    return action$
      .pipe(
        operators.filter(ofType(actions.SUBMIT)),
        operators.switchMap(() => state$.pipe(operators.take(1))),
        operators.filter(state => !state.is_loading),
        operators.debounceTime(200),
        operators.pluck("form"),
        operators.distinctUntilChanged(R.equals),
        operators.map(createAction(actions.REQUEST_SIGNUP)),
      );
  }

  function requestInviteEpic (action$, state$) {
    return action$
      .pipe(
        operators.filter(ofType(actions.REQUEST_SIGNUP)),
        operators.pluck("data"),
        operators.switchMap(data => ajax
            .post("/signup", data, {
              "Content-Type": "application/json",
            })
            .pipe(
              operators.map(createAction(actions.SIGNUP_SUCCESS)),
              operators.catchError(err => Rx.of(
                createAction(actions.SIGNUP_ERRORS, err.response.errors)
              )),
              delayAtLeast(1200),
            )
        )
      );
  }

  const epic = combineEpics(
    submitEpic,
    requestInviteEpic,
  );

  // Store init
  // ---------------------------------------------------------------------------

  const action$ = new Rx.Subject();
  const state$ = action$
    .pipe(
      operators.startWith(reducer({}, {})),
      operators.scan(reducer),
      operators.publishReplay(1),
      operators.refCount(),
    );

  const epic$ = epic(action$, state$, deps)
    .subscribe(action => action$.next(action));

  const dispatch = action => action$.next(action);

  const store = {
    dispatch,
    state$,
  };

  // View
  // ---------------------------------------------------------------------------

  function h (element, attrs, children=[]) {
    const el = document.createElement(element);

    R.toPairs(attrs)
      .forEach(([ key, value]) => {
        if (typeof value === "function") {
          el[key] = value;
        }
        else {
          el.setAttribute(key, value);
        }
      });

    [].concat(children).forEach(child => {
      if (typeof child === "string") {
        el.appendChild(document.createTextNode(child));
      }
      else {
        el.appendChild(child);
      }
    });

    return el;
  }

  // App
  // ---------------------------------------------------------------------------
  const isView = R.propEq("view");
  const el = document.querySelector(".app");

  const app = state$
    .pipe(
      operators.tap(console.log),
      operators.distinctUntilKeyChanged("view"),
      operators.map(R.cond([
        [ isView("confirm"), renderConfirm ],
        [ isView("form"), renderForm ],
      ])),
      operators.startWith(null),
      operators.pairwise(),
    )
    .subscribe(([ prev, next ]) => {
      if (prev) {
        el.replaceChild(next, prev);
      }
      else {
        el.replaceChild(next, el.firstChild);
      }
    })

  const errors$ = state$
    .pipe(
      operators.filter(isView("form")),
      operators.distinctUntilKeyChanged("errors"),
      operators.map(renderFormErrors),
    )
    .subscribe(errorsView => {
      const el = document.querySelector(".form__errors");

      el.replaceChild(errorsView, el.firstChild);
    });

  const loading$ = state$
    .pipe(
      operators.filter(isView("form")),
      operators.distinctUntilKeyChanged("is_loading"),
      operators.map(R.prop("is_loading")),
      operators.skip(1),
    )
    .subscribe(isLoading => {
      const el = document.querySelector(".signup-form__btn");

      el.disabled = isLoading;
      el.innerHTML = isLoading ? "Requesting Invite&hellip;" : "Try Again";
    })

  function renderFormErrors (state) {
    return h("ul", { class: "form-errors" }, state.errors
      .map(err => h("li", { class: "form-error" }, [
        h("span", { class: "form-error__label"}, err.label),
        h("p", { class: "form-error__message"}, err.message),
      ])),
    );
  }

  function renderForm (state) {
    return h("form", { class: "signup-form form",
                       onsubmit }, [
      h("div",     { class: "form-field signup-form__first-name" }, [
        h("label", { for: "id_first_name",
                     class: "form-label" },
                   "First Name"),
        h("input", { id: "id_first_name",
                     name: "first_name",
                     class: "form-input form-input--type_text",
                     oninput,
                     type: "text" }),
      ]),
      h("div",     { class: "form-field signup-form__last-name" }, [
        h("label", { for: "id_last_name",
                     class: "form-label" },
                   "Last Name"),
        h("input", { id: "id_last_name",
                     name: "last_name",
                     class: "form-input form-input--type_text",
                     oninput,
                     type: "text" }),
      ]),
      h("div",     { class: "form-field signup-form__email" }, [
        h("label", { for: "id_email",
                     class: "form-label" },
                   "Email"),
        h("input", { id: "id_email",
                     name: "email",
                     class: "form-input form-input--type_text",
                     oninput,
                     type: "text" }),
      ]),
      h("div",     { class: "form__errors" }, [
        renderFormErrors(state),
      ]),
      h("div",     { class: "form-field signup-form__submit" }, [
        h("button", { type: "submit",
                      name: "email",
                      class: "signup-form__btn" },
                    "Request an Invite"),
      ])
    ]);
  }

  function renderConfirm (state) {
    return h("div", { class: "signup-confirm" }, [
      h("h1", {}, "An invite will be sent")
    ])
  }

  function onsubmit (e) {
    e.preventDefault();
    store.dispatch(createAction(
      actions.SUBMIT,
      {},
    ))
  }

  function oninput (e) {
    store.dispatch(createAction(
      actions.UPDATE_FORM,
      { [e.target.name]: e.target.value },
    ));
  }

})(window, document);
