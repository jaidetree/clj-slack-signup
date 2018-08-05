(ns slack-signup.core
  (:require [clj-http.client :as client]))

(def email-regex
     #"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$")

(defn is-email?
  [email]
  (boolean (and email
                (re-find email-regex email))))

(defn is-valid?
  [form-data]
  (let [{:keys [email]}  form-data]
    (and (is-email? email))))
