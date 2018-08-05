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

  const createAction = R.curry(function createAction (type, data) {
    return { type, data };
  });

  const ofType = types => action => [].concat(types).includes(action.type);

  // Store
  // ---------------------------------------------------------------------------
  const actions = {
    SIGNUP_ERRORS: "signup/errors",
    SIGNUP_SUCCESS: "signup/success",
    SUBMIT: "signup/form/submit",
    UPDATE_FORM: "signup/form/update",
  };

  const deps = {
    window,
  };

  const reducer = combineReducers({
    errors: createReducer({
      initial: [],
      [actions.SIGNUP_SUBMIT]: () => [],
      [actions.SIGNUP_ERRORS]: (state, action) =>
        R.uniq(state.concat(action.data)),
    }),
    form: createReducer({
      initial: {
        name: "",
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
        operators.pluck("form"),
        operators.flatMap(data => ajax
            .post("/signup", data, {
              "Content-Type": "application/json",
            })
            .pipe(
              operators.map(createAction(actions.SIGNUP_SUCCESS)),
              operators.catchError(err => Rx.of(
                createAction(actions.SIGNUP_ERRORS, err)
              )),
            )
        )
      )
  }

  const epic = combineEpics(
    submitEpic,
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
    .pipe(
      operators.tap(console.log),
    )
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

  function renderForm (state) {
    return h("form", { class: "signup-form form",
                       onsubmit }, [
      h("div",     { class: "form-field" }, [
        h("label", { for: "id_email",
                     class: "form-label" },
                   "Email"),
        h("input", { id: "id_email",
                     name: "email",
                     class: "form-input form-input--type_text",
                     oninput: e => store
                      .dispatch(createAction(
                        actions.UPDATE_FORM,
                        { email: e.target.value },
                      )),
                     type: "text" }),
      ])
    ])
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
      { email: e.target.value },
    ));
  }

})(window, document);
